# Ocasio — Booking Architecture

**Audience:** Engineers working on the booking lifecycle.
**Status:** Phase 3. Describes what exists, not what is planned.
**See also:** [`OCASIO_DATABASE.md`](./OCASIO_DATABASE.md) · [`OCASIO_MARKETPLACE.md`](./OCASIO_MARKETPLACE.md)

---

## 1. The design rule

> **The client supplies intent, never facts.**

The browser sends a service, a date, a location and some notes. Everything that
matters for authorisation or money is derived inside the database:

| Field | Source |
|---|---|
| `customer_id` | `auth.uid()` |
| `vendor_id` | Derived from the service |
| `quoted_price` | Derived from the service, then the vendor |
| `status` | Forced to `pending` |

`bookings` carries **SELECT policies only**. There is no INSERT, UPDATE or
DELETE policy, so a direct write from the browser matches zero rows. The only
write path is the two functions below.

Opening DevTools and changing `customer_id`, `vendor_id`, `quoted_price` or
`status` in a request accomplishes nothing. There are tests for each.

---

## 2. Schema

```
profiles ──1:N──┐
                ▼
            bookings ──1:N──► booking_status_history
                ▲                 booking_id
    vendors ────┤                 from_status  (null on the opening row)
                │                 to_status
    vendor_services                changed_by
                                   note, created_at
```

### `bookings`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `customer_id` | uuid → `profiles` | cascade |
| `vendor_id` | uuid → `vendors` | cascade; denormalised from the service |
| `vendor_service_id` | uuid → `vendor_services` | **restrict** |
| `event_date` | date | not null |
| `event_location` | text | not null, non-blank |
| `customer_notes` | text | ≤ 2000 chars |
| `quoted_price` | integer | not null, ≥ 0, rupees |
| `status` | `booking_status` | default `pending` |
| `created_at` / `updated_at` | timestamptz | |

`vendor_service_id` uses `ON DELETE RESTRICT` deliberately: a service with
booking history must not vanish and leave bookings pointing at nothing.
Retire it with `is_active = false` instead.

`vendor_id` is denormalised from the service so vendor-scoped reads and policies
do not need a join. `create_booking()` derives it and
`protect_booking_fields()` forbids changing it, so it cannot drift.

### `booking_status_history`

Append-only. `from_status` is null on the opening row, because the booking did
not exist before it was requested. `changed_by` is `ON DELETE SET NULL` — a
deleted account must not erase the record that a transition happened.

### Indexes

`(customer_id, created_at desc)` · `(vendor_id, status, created_at desc)` ·
`(vendor_service_id)` · `(event_date)` · `(booking_id, created_at)` on history.

### Duplicate protection

```sql
create unique index bookings_no_duplicate_live_request
  on public.bookings (customer_id, vendor_service_id, event_date)
  where status in ('pending', 'accepted');
```

Guards against a double-submitted form. Scoped to live bookings, so a customer
may rebook the same service and date after cancelling or being declined.

---

## 3. Lifecycle

```
                    ┌──────────► accepted ──────────► completed  (terminal)
                    │               │
   (new) ──► pending│               └──────────────► cancelled   (terminal)
                    ├──────────► declined                (terminal)
                    └──────────► cancelled               (terminal)
```

| From | To | Who |
|---|---|---|
| `pending` | `accepted` | Vendor owner |
| `pending` | `declined` | Vendor owner |
| `pending` | `cancelled` | Customer |
| `accepted` | `completed` | Vendor owner |
| `accepted` | `cancelled` | Customer **or** vendor owner |

`declined`, `cancelled` and `completed` are terminal. Nothing leaves them —
including `declined → accepted`, `cancelled → completed` and any change to a
completed booking.

### Cancellation rules

- **A customer may cancel `pending` or `accepted`.** There is no cut-off window,
  because there is no payment, deposit or penalty to protect. When payments
  land, this is the rule that will need a policy.
- **A vendor may cancel `accepted`, not `pending`.** From `pending` the correct
  action is *decline*, which is a distinct outcome worth recording separately.
  Vendor cancellation exists because vendors genuinely have to withdraw, and
  forcing them to mark a job "completed" that never happened would corrupt the
  record. The history row names who did it.

### Concurrency

`transition_booking_status()` selects `FOR UPDATE`, so two simultaneous requests
on the same booking serialise. Two vendors cannot both read `pending` and both
act on it.

---

## 4. Functions

### `create_booking(p_vendor_service_id, p_event_date, p_event_location, p_customer_notes)`

`SECURITY DEFINER`. Validates, in order:

1. The caller is signed in.
2. The service exists and `is_active`.
3. The vendor exists and `status = 'active'`.
4. The caller is not the vendor's own owner.
5. `event_date` is present and not in the past.
6. `event_location` is non-blank.
7. A price can be determined.

Then inserts the booking as `pending` and writes the `NULL → pending` history
row in the same transaction.

"The service must belong to the vendor" is true **by construction**: the vendor
is read from the service, so there is no pair to validate.

### `transition_booking_status(p_booking_id, p_new_status, p_note)`

`SECURITY DEFINER`. Loads the booking `FOR UPDATE`, establishes whether the
caller is the customer or the vendor owner, rejects terminal states and invalid
pairs, updates, then appends a history row.

A booking that is not yours returns **"Booking not found"** — the same message
as one that does not exist. A different error would let someone probe for the
existence of other people's rows.

### Why `SECURITY DEFINER` here

Both functions must write tables that have no INSERT policy. Each takes no SQL
text, runs no dynamic SQL, pins `search_path = ''`, and is granted only to
`authenticated`. Authorisation is re-derived inside the function from
`auth.uid()` — the parameters cannot influence who the caller is.

---

## 5. RLS

| Table | anon | customer | vendor owner |
|---|---|---|---|
| `bookings` | — | SELECT own | SELECT for vendors they own |
| `booking_status_history` | — | SELECT for bookings they can see | same |

No INSERT, UPDATE or DELETE policy on either table.

### A trap worth knowing

**With no UPDATE policy, a malicious update silently matches zero rows and
returns success.** It does not raise an error. Any test asserting "no error was
returned" would pass while proving nothing.

The tests therefore assert on **state** — that the row is unchanged — which is
what actually demonstrates the rule.

### Defence in depth

`protect_booking_fields()` rejects changes to `customer_id`, `vendor_id`,
`vendor_service_id`, `quoted_price` and `created_at`, and confines `status` to
the transition function via a transaction-scoped setting.

The trigger is unreachable from the client today, because no write policy
exists. It is there so that adding one later cannot silently open a hole, and so
`service_role` tooling cannot rewrite a booking's identity or price by accident.

---

## 6. Pricing

```
quoted_price = coalesce(vendor_services.price, vendors.starting_price)
```

If both are null the booking is refused with *"This service has no published
price, so it cannot be booked online yet."*

> **Current limitation.** All 320 seeded services have `price = NULL`, so in
> practice every seeded vendor quotes its **starting price** regardless of which
> service is chosen. The mechanism is correct and a priced service is quoted
> from its own price — there is a test for both paths — but the demo catalogue
> does not exercise the first branch.

`quoted_price` is **informational**. It is a starting figure, not an invoice.
No money moves anywhere in Ocasio, and the UI says so at every point it appears.

---

## 7. What the UI may and may not do

`src/services/bookings.ts` holds **no authorisation logic**. `canCustomerCancel`
and `vendorActionsFor` mirror the lifecycle so the UI can hide impossible
actions, but they are presentation hints. A hand-crafted request gets exactly
the same answer as a hidden button.

Error text is translated before display: messages raised by the two functions
are written for end users and pass through; constraint names, RLS codes and
connection failures are replaced with a generic line and logged to the console.

### Product language

| Says | Because |
|---|---|
| "Booking request submitted" | It is a request, not a booking |
| "Pending vendor response" | The vendor has not answered |
| "Accepted by vendor" | Never "confirmed" — that implies payment |
| "Indicative quote" | A starting figure, not an invoice |
| "no payment has been taken" | Stated on the confirmation and the detail page |

There is no "Book now", no "Payment complete", no "Confirmed".

---

## 8. Known limitations

- **No availability or calendar.** Two customers can request the same vendor on
  the same date and both requests will exist. A vendor can accept both. Nothing
  checks for a clash, because vendor availability is not modelled. The
  duplicate-request index prevents only the *same customer* double-submitting
  the *same service and date*. This is deliberate: pretending to manage a
  calendar without storing one would be worse than not having it.
- **No notifications.** A vendor is not told a request arrived, and a customer
  is not told it was answered. Both must check the site.
- **No payments.** Phase 4.
- **No messaging.** The vendor page's contact panel is still a placeholder and
  is labelled as one. No chat data is stored.
- **Seeded services carry no price**, so the service-price branch of the quote
  is untested against demo data (see §6).
- **The vendor dashboard has no navbar.** It renders outside the site chrome, so
  there is no sign-out or site navigation from that page. Pre-existing, not
  introduced here, but it now matters more because vendors spend time there.
- **Vendor cancellation is not rate-limited or penalised.** Nothing discourages
  a vendor from accepting and then cancelling.

---

## 9. Future integration

### Payments (Phase 4)

`accepted` is the natural trigger. The likely shape is a `payments` table keyed
by `booking_id` with `UNIQUE (provider, provider_order_id)` for webhook
idempotency, and a `payment_status` separate from `booking_status` — a booking
being accepted and a booking being paid are different facts and should not share
a column.

`quoted_price` becomes the basis for an order amount, and should be **frozen**
at that point: today it is already immutable after creation, which is why that
rule exists now rather than later.

A booking must never be marked paid by a frontend callback. The webhook is the
only authority.

Cancellation rules will need revisiting once money is involved — refund windows,
partial refunds, and who bears the cost of a vendor cancellation.

### Messaging (Phase 5+)

A `conversations` table scoped to a booking is the obvious shape, since the two
parties are already established and RLS can reuse the same "customer or vendor
owner" predicate. `booking_status_history.note` already carries short vendor
explanations, and should not grow into a chat substitute.

---

## 10. Testing

```bash
npx supabase start
npm test            # 112 integration tests, 46 of them bookings
npx playwright test # 20 E2E, 8 of them bookings (desktop + mobile)
```

Authorization tests run against real Postgres with real RLS. They assert on
state rather than error presence, for the reason in §5.

Mutation-verified: allowing customers to accept their own bookings failed 2
tests; allowing them to complete failed 1. A suite that cannot fail proves
nothing.
