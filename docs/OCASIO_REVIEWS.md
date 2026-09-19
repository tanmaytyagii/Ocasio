# Ocasio — Reviews, Ratings and Payment Reconciliation

**Audience:** Engineers working on the trust layer or payment operations.
**Status:** Phase 5. Describes what exists, not what is planned.
**See also:** [`OCASIO_BOOKINGS.md`](./OCASIO_BOOKINGS.md) · [`OCASIO_PAYMENTS.md`](./OCASIO_PAYMENTS.md)

---

## 1. Reviews

### The rule

> **A review requires a completed booking that belongs to you, and there is one
> per booking.**

Uniqueness is a `UNIQUE` constraint on `booking_id`, not application logic.
`customer_id` comes from `auth.uid()`; `vendor_id` is read from the booking.
Neither is a parameter, so neither can be forged.

**A customer cannot manufacture eligibility.** Only the vendor owner can move a
booking to `completed`, and only from `accepted` (migration `…0004`). So the
gate is not "the client claims this is completed" — it is a state only the
counterparty can produce.

### Schema

| Column | Notes |
|---|---|
| `booking_id` | → bookings, **UNIQUE**, `ON DELETE RESTRICT` |
| `customer_id` | derived; not readable by any client role |
| `vendor_id` | derived from the booking |
| `rating` | `smallint`, `CHECK between 1 and 5` |
| `body` | optional; when present, 3–2000 characters after trimming |

A whitespace-only body is stored as `NULL` rather than blank — a review made of
spaces is worse than no review.

### Lifecycle

```
completed booking ──► create_review() ──► review (immutable)
```

There is no second state. **Reviews cannot be edited or deleted**, and there are
no `UPDATE` or `DELETE` policies. That is deliberate: editing and deletion would
require rules about who may rewrite a public rating and when, and no such rule
exists in the product. Inventing one would be inventing policy.

### RLS

| Table | anon | authenticated | customer | vendor |
|---|---|---|---|---|
| `reviews` | SELECT (public columns) | SELECT (public columns) | + create own via function | no write at all |

`customer_id` is an `auth.users` UUID and is excluded from the grant for **both**
`anon` and `authenticated` — the same treatment `vendors.owner_id` gets. Reviews
are therefore displayed without attribution, which is also why `select(*)` on
reviews is denied.

> **Maintenance:** a column added to `reviews` later will not be readable until
> it is added to the grant list in migration `…0006`. New columns are private by
> default.

---

## 2. Rating aggregates

```
vendors.rating       = round(avg(reviews.rating), 1)   -- numeric(2,1)
vendors.review_count = count(reviews)
```

Maintained by `recalculate_vendor_rating()`, an `AFTER INSERT OR UPDATE OR
DELETE` trigger on `reviews`.

### Why a full recompute, not an increment

Incrementing is where aggregate bugs live: a concurrent insert produces a lost
update, and an arithmetic slip is permanent because nothing re-derives the truth.
Recomputing from the table is O(reviews-per-vendor) — nothing at this scale — and
cannot drift.

The trigger covers UPDATE and DELETE even though neither is reachable from a
client, so the aggregate stays correct if an operator removes a review.

### Zero-review representation

A vendor with no reviews reports `rating = 0, review_count = 0` — exactly the
column defaults, so a vendor whose last review is removed returns to the same
representation a brand-new vendor has. Tested both ways.

### How the Phase 1 guard was preserved

`protect_vendor_moderated_fields()` has forbidden anyone with an end-user
identity from writing `rating` or `review_count` since Phase 1. That guard is
what stops a vendor inflating their own score, and it still does.

It also blocked the aggregate trigger, which runs inside a customer's INSERT and
therefore has `auth.uid()` set. Rather than weakening it, Phase 5 adds the same
transaction-scoped escape hatch Phase 4 used for payment status:
`ocasio.allow_rating_recompute`, set only by `recalculate_vendor_rating()` and
only for its own UPDATE.

> ### ⚠️ Seeded ratings are not review-derived
>
> The 40 demo vendors carry fabricated ratings (4.0–5.0) and review counts
> (57–495) with **no reviews behind them**. The trigger only fires when a review
> changes, so those values persist until a vendor receives a real review — at
> which point the aggregate becomes authoritative and the displayed figure will
> jump (e.g. `4.8 · 290 reviews` → `3.0 · 1 review`).
>
> This is correct behaviour, not a bug: the new figure is the real one. It is
> called out because it is visibly jarring. Zeroing the seed was rejected because
> it would break the Phase 2 marketplace tests that filter on rating, and the
> brief required preserving the existing rating semantics.

---

## 3. Payment reconciliation

### The problem

A payment strands in `processing` when a webhook is never delivered. Nothing
polled the provider, so it stayed there forever — a limitation recorded at the
end of Phase 4.

### The rule

> **An inconclusive answer changes nothing.** Guessing is how money goes missing.

`reconcile_payment()` takes what the provider *said*, not what we want:

| Provider says | Effect |
|---|---|
| `succeeded` | Settles, exactly as the webhook would |
| `failed` | Fails, exactly as the webhook would |
| `pending` | **Nothing.** Audited as inconclusive |
| `unknown` | **Nothing.** Audited as inconclusive |
| anything else | Rejected |

A payment already in a settled state (`succeeded`, `failed`, `cancelled`,
`refunded`, `partially_refunded`) is never revisited — a sweep arriving after a
webhook cannot undo it. That is audited as `payment.reconciliation_skipped`.

### It is not a second path into the state machine

Reconciliation writes a `payment_events` row and applies the same transitions the
webhook path applies. Idempotency and replay protection are therefore the
**existing** ones: `UNIQUE (provider, provider_event_id)` plus the `processed_at`
check. The synthetic event id is `reconcile:<ref>`.

Running the same sweep twice applies once — one event row, one audit entry.

### Staleness is measured from `processing_since`

A new column, set by `start_payment()`.

> It cannot be measured from `updated_at`: `payments_set_updated_at` is a BEFORE
> UPDATE trigger that rewrites `updated_at` to `now()` on every write, so any
> later touch would reset the clock and hide a genuinely stranded payment.
>
> Found by testing — the first implementation used `updated_at` and the stale
> detection test could not make a payment look old.

### Authorization

`find_stale_payments()` and `reconcile_payment()` are granted to **`service_role`
only**, and `reconcile_payment` is `SECURITY INVOKER` for the same reason as
`process_payment_event`: if it were DEFINER and were later granted to
`authenticated` by mistake, every user could settle their own payments. As an
invoker function, RLS stops the write even then.

### The worker

`supabase/functions/payments-reconcile/index.ts` lists stale payments, asks the
provider adapter about each, and hands the answer to `reconcile_payment()`.

The `ReconciliationProvider` interface is the extension point. The local/test
implementation always answers `unknown` — the safe answer, and the one that
leaves the payment untouched. It exists so the sweep can run end to end without a
provider, **not** so it can settle anything. Tests drive concrete outcomes by
calling `reconcile_payment()` directly with the status a real provider would have
reported.

A payment with no `provider_payment_id` is skipped: the handoff never completed,
so there is nothing to ask about.

**Reconciliation never creates a refund**, never alters `amount_minor`, and never
touches `bookings.quoted_price`. All three are tested.

---

## 4. Security summary

Verified by test:

- A customer cannot review another customer's booking, a non-completed booking,
  or the same booking twice.
- A customer cannot forge `vendor_id` or `customer_id`, nor INSERT a review
  directly.
- A vendor cannot create, edit or delete a review of their own business, through
  the function or directly.
- Neither a vendor nor a customer can write `rating` or `review_count`.
- Ratings outside 1–5, null ratings, and malformed bodies are refused.
- `customer_id` is unreadable by `anon` and by `authenticated`.
- Reconciliation is unreachable by `anon`, by a customer, and by a vendor.
- Payment webhook and refund authorization from Phase 4 are unchanged; their
  tests still pass.

No existing RLS policy was weakened. No service-role key appears in `src/` or the
built bundle. No sensitive payment data was introduced.

---

## 5. Known limitations

- **Seeded demo ratings are not review-derived** (§2) and will jump when a real
  review lands.
- **Reviews are anonymous.** `profiles` is not publicly readable and nothing
  exposes a display name, so reviews show a rating, text and date only.
- **No vendor response to a review**, no moderation, no reporting, no
  helpfulness voting.
- **No review editing or deletion**, by design (§1).
- **Reviews are not gated on payment.** A completed booking is sufficient; a
  booking can be completed without ever being paid. That matches the Phase 3/4
  split where completion and payment are independent facts.
- **The reconciliation worker is not covered by automated tests.** It runs on
  Deno and needs `supabase functions serve`. The database function it calls is
  fully tested; the HTTP handler has not run in CI. Same caveat as the payment
  webhook.
- **Nothing schedules the sweep.** It must be invoked by cron or an operator.
- **Account deletion is blocked for users with financial or review history.**
  `payments.booking_id`, `reviews.booking_id` and `reviews.customer_id` are all
  `ON DELETE RESTRICT`, so deleting a profile fails once a booking has been paid
  or reviewed. This predates Phase 5 — `payments` introduced it in Phase 4 — and
  Phase 5 widens it. It is a real problem for account deletion and data-subject
  requests, and it needs a deliberate decision (anonymise vs. cascade) rather
  than a late change to foreign keys. **Documented, not fixed.**

---

## 6. Testing

```bash
npx supabase start
npm test             # 221 tests: 54 reviews/aggregates, 22 reconciliation
npx playwright test  # 32 E2E, 4 of them reviews (desktop + mobile)
```

Mutation-verified. Six deliberate weakenings:

| Mutation | Result |
|---|---|
| Allow reviewing any booking status | 4 failed ✓ |
| Remove the booking-ownership check | 2 failed ✓ |
| Treat an inconclusive provider answer as success | 3 failed ✓ |
| Let reconciliation overwrite a settled payment | 1 failed ✓ |
| Grant `reconcile_payment` to `authenticated` | 1 failed ✓ |
| Make the aggregate use `max` instead of `avg` | 7 failed ✓ |

The ownership mutation initially appeared to pass; the mutation script had a
quoting bug and had silently made no change. Re-run with the edit verified, it
fails 2 tests.
