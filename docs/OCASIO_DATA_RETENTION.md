# Ocasio — Account Deletion and Data Retention

**Audience:** Engineers and whoever owns the product/privacy decision.
**Status:** Phase 5.1. **This documents a limitation. It does not fix it.**

> **Summary:** a customer who has paid for a booking or reviewed a vendor
> **cannot be deleted**. The delete fails at the database. This is currently
> honest — nothing is silently destroyed — but it is not a workable account
> deletion story, and it needs a product decision that Phase 5.1 deliberately
> did not make on its own.

---

## 1. Current behaviour

Pinned by tests in `tests/scheduling-and-retention.test.ts`:

| Who | Can be deleted? | Why |
|---|---|---|
| Customer with no history | ✅ | Nothing references them |
| Customer with a booking only | ✅ | `bookings.customer_id` CASCADEs |
| Customer with favourites | ✅ | `favorites.user_id` CASCADEs |
| **Customer who has paid** | ❌ | `payments.customer_id` and `payments.booking_id` RESTRICT |
| **Customer who has reviewed** | ❌ | `reviews.customer_id` and `reviews.booking_id` RESTRICT |
| **Vendor owner whose vendor has payments or reviews** | ❌ | `vendors` CASCADEs from `profiles`, but `payments.vendor_id` / `reviews.vendor_id` RESTRICT |

The delete fails with a foreign-key violation. The account and all its data
remain fully intact — the user is not partially deleted.

---

## 2. Every foreign key that matters

Deleting `auth.users` cascades to `profiles`, and from there:

### CASCADE — removed with the account

| Reference | Effect |
|---|---|
| `bookings.customer_id → profiles` | Their bookings are deleted |
| `booking_status_history.booking_id → bookings` | History goes with the booking |
| `favorites.user_id → profiles` | Shortlist deleted |
| `vendors.owner_id → profiles` | Their vendor listing is deleted |
| `vendor_services.vendor_id`, `vendor_media.vendor_id` | Deleted with the vendor |

### SET NULL — survives, de-linked

| Reference | Effect |
|---|---|
| `booking_status_history.changed_by → profiles` | Transition record kept, actor forgotten |
| `refunds.initiated_by → profiles` | Refund kept, initiator forgotten |
| `audit_log.actor_id → profiles` | Audit entry kept, actor forgotten |

### RESTRICT — **blocks the delete**

| Reference | Why it exists |
|---|---|
| `payments.customer_id → profiles` | A financial record must not vanish |
| `payments.booking_id → bookings` | A payment must not be orphaned |
| `payments.vendor_id → vendors` | Same, from the merchant side |
| `reviews.customer_id → profiles` | A public rating must not be rewritten by the reviewer closing their account |
| `reviews.booking_id → bookings` | A review must stay tied to the work it describes |
| `reviews.vendor_id → vendors` | Same |
| `refunds.payment_id → payments` | A refund must not be orphaned |
| `bookings.vendor_service_id → vendor_services` | A booking must not point at nothing |

**The RESTRICT on `reviews` is load-bearing, not an oversight.** If it became a
CASCADE, anyone could remove a bad review by deleting their account, and the
vendor's public rating would silently change. There is a test asserting the
review survives.

---

## 3. Where user identity actually lives

| Table | Identifying content |
|---|---|
| `auth.users` | **email**, phone, provider identities |
| `profiles` | **full_name**, avatar_url |
| `bookings` | `event_location` (often a home address), `customer_notes` (free text) |
| `reviews` | `body` (free text, may self-identify) |
| `payments` | `customer_id` only — no name, email or card data |
| `payment_events` | provider payloads; no card data (trigger-enforced) |
| `audit_log` | `actor_id` only |

Two things worth noting:

- **Payments hold no personal data beyond a foreign key.** Anonymising the
  customer would leave the financial record complete and unidentifiable.
- **Bookings and reviews hold free text.** Those are the fields that would
  genuinely need scrubbing, and scrubbing a review is a content decision, not a
  technical one.

---

## 4. What could be anonymised, and what could not

**Could be, safely:** `profiles.full_name` / `avatar_url` → null ·
`auth.users.email` → a non-routable placeholder · `bookings.event_location` and
`customer_notes` → redacted · `reviews.body` → redacted while keeping the rating.

**Should not be:** `payments` amounts, statuses and timestamps · `refunds` ·
`payment_events` · `audit_log` actions · `reviews.rating` and its effect on the
vendor aggregate.

Removing the rating would let someone rewrite a vendor's public score by leaving,
which is the exact thing the RESTRICT protects against.

---

## 5. Why Phase 5.1 did not implement it

The brief said to prefer anonymisation over destructive deletion, **but only if
the identity fields and authorization implications are fully understood and
tested**. They are not, and the gaps are product decisions rather than
engineering ones:

1. **Does a review survive its author?** If yes, ratings stay stable and
   deletion is partial. If no, vendors' scores move when users leave. This is a
   marketplace-fairness call.
2. **What happens to a vendor with live bookings whose owner leaves?** Today the
   vendor cascades away. With payments attached it cannot, and there is no
   ownership-transfer or vendor-closure flow.
3. **Does anonymisation need to be reversible** for a dispute or a chargeback?
   There is no dispute process yet (Phase 4 limitation), so there is nothing to
   weigh it against.
4. **Who may trigger deletion?** There is no admin UI and no self-service
   deletion. `service_role` is the only actor, so any implementation would be an
   operator runbook, not a product feature.
5. **What retention period applies to financial records?** This is a
   jurisdictional question. **No legal requirement has been invented here** —
   it simply has not been answered.

Implementing an anonymisation path without those answers would bake guesses into
foreign keys and a `SECURITY DEFINER` function that rewrites user data — the
hardest kind of decision to reverse later.

---

## 6. Recommended shape, when it is decided

Sketch only; **not implemented**.

1. A reserved tombstone profile, or make `payments.customer_id` and
   `reviews.customer_id` nullable with `ON DELETE SET NULL` — which preserves
   the financial and rating records while de-linking the person. Reviews are
   already displayed without attribution, so nothing user-visible changes.
2. `anonymise_account(p_user_id uuid)`, `SECURITY DEFINER`, `service_role` only:
   clears `profiles` identity fields, redacts `bookings.event_location` /
   `customer_notes` and `reviews.body`, rewrites the auth email to a
   non-routable placeholder, and writes an `account.anonymised` audit row.
3. Keep `reviews.rating`, all of `payments`, `refunds`, `payment_events` and
   `audit_log` intact.
4. Tests: identity gone, financial totals unchanged, vendor aggregate unchanged,
   review still counted, and the operation idempotent.

The `SET NULL` route is preferable to a tombstone: fewer moving parts, and it
cannot be confused with a real account.

---

## 7. Operational workaround today

There is no supported self-service deletion. An operator can, with
`service_role`:

- delete an account with no payment or review history directly;
- for one with history, manually clear the blocking rows first — **which
  destroys financial and rating records** and should not be routine.

Neither is a substitute for the decision above.
