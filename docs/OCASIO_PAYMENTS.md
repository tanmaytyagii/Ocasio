# Ocasio — Payment Architecture

**Audience:** Engineers working on payments, refunds or the trust layer.
**Status:** Phase 4. Describes what exists, not what is planned.
**See also:** [`OCASIO_BOOKINGS.md`](./OCASIO_BOOKINGS.md) · [`OCASIO_DATABASE.md`](./OCASIO_DATABASE.md)

> **No real payment provider is integrated.** Money does not move. The domain,
> the state machine, the webhook boundary and the authorization rules are real
> and tested; the provider adapter is a deterministic local one. See §9 for
> exactly where a real provider plugs in.

---

## 1. The rule that matters

> **The browser can never move a payment to a settled state.**

`process_payment_event()` is the only path to `succeeded`. It is granted to
`service_role` alone, and it is a **SECURITY INVOKER** function — so even if
someone later granted it to `authenticated` by mistake, RLS would still stop the
write, because `payments` has no INSERT or UPDATE policy.

Everything a client can influence is derived server-side:

| Field | Source |
|---|---|
| `customer_id` | `auth.uid()` |
| `vendor_id` | The booking |
| `amount_minor` | `bookings.quoted_price × 100` |
| `currency` | Fixed `INR` |
| `status` | Forced to `pending`; changed only by the functions |

Opening DevTools and rewriting a request achieves nothing. There are tests for
each of these.

---

## 2. Phase 3 is unchanged

`booking_status` was not touched. Every Phase 3 transition still works, and
`accepted` still means *the vendor agreed to the work* — not *paid*.

Whether money moved is a separate fact in `payments`. Conflating them into one
column is the mistake this design exists to avoid.

**Cancelling a paid booking is still allowed.** Phase 3 permitted it and Phase 4
does not take that away. The payment stays `succeeded` and becomes refundable;
the money question is answered by a refund, not by blocking the transition.
There is a test asserting exactly this.

---

## 3. Money representation

Phases 1–3 store **rupees** (`bookings.quoted_price`, `vendor_services.price`).
Payments store **minor units — paise** (`amount_minor`).

Providers transact in minor units. Converting at the provider boundary instead
would mean a float multiply or a rounding decision on every call. The conversion
happens **once**, server-side, in `create_payment_for_booking()`, and nowhere
else. Column names carry the unit so the two cannot be confused.

No floating-point arithmetic touches money anywhere: `bigint` in the database,
integer arithmetic in SQL, and `Math.round` only at the display boundary.

### Price integrity

`bookings.quoted_price` is already immutable after creation
(`protect_booking_fields`, Phase 3). `create_payment_for_booking()` snapshots it
into `amount_minor`, and `protect_payment_fields()` makes that immutable too.

A vendor changing their service price afterwards cannot alter what was charged —
tested directly.

**`booking total === payable amount`.** There are no fees, taxes, discounts or
platform commissions, because none exist in the product. None were invented.

---

## 4. Schema

```
bookings ──1:N──► payments ──1:N──► refunds
                     │
                     └──1:N──► payment_events   (raw provider deliveries)

audit_log  (operator-facing, references nothing directly)
```

### `payments`

| Column | Notes |
|---|---|
| `booking_id` | → bookings, **restrict** |
| `customer_id`, `vendor_id` | denormalised, frozen by trigger |
| `amount_minor` | `bigint`, > 0, paise |
| `currency` | `char(3)`, uppercase |
| `amount_refunded_minor` | ≥ 0 and ≤ `amount_minor`, enforced by constraint |
| `status` | `payment_status` |
| `provider`, `provider_payment_id` | unique together when present |
| `idempotency_key` | unique |
| `metadata` | jsonb; sensitive keys rejected by trigger |

Key indexes: `idempotency_key` unique · `(provider, provider_payment_id)` unique
· **`payments_one_live_per_booking`** — a partial unique index that permits at
most one payment per booking in `pending`, `processing`, `succeeded`,
`partially_refunded` or `refunded`. A `failed` or `cancelled` attempt leaves the
booking payable again.

### `payment_events`

Raw deliveries. `UNIQUE (provider, provider_event_id)` plus a `processed_at`
timestamp are the replay guard (§7). **No client role can read this table.**

### `refunds`

`amount_minor`, `reason`, `status`, `provider_refund_id`, unique
`idempotency_key`, `initiated_by`.

### `audit_log`

`actor_id`, `actor_role`, `action`, `entity_type`, `entity_id`,
`provider_event_id`, `metadata`. **No client role can read it** — it is for
operators. The user-facing trail remains `booking_status_history`.

---

## 5. Payment state machine

```
  pending ──► processing ──┬──► succeeded ──┬──► partially_refunded ──► refunded
     │            │        │                └──► refunded
     │            │        ├──► failed
     └────────────┴────────┴──► cancelled
```

| From | To | Who |
|---|---|---|
| — | `pending` | Customer, via `create_payment_for_booking()` |
| `pending` | `processing` | Customer, via `start_payment()` |
| `pending`/`processing` | `cancelled` | Customer, via `cancel_payment()` |
| `processing` | `succeeded` / `failed` / `cancelled` | **Webhook only** |
| `succeeded` | `partially_refunded` / `refunded` | Refund settlement |

Settled statuses (`succeeded`, `refunded`, `partially_refunded`) are terminal
with respect to webhook outcomes: a late `failed` event is recorded and ignored.
A `cancelled` payment cannot later be settled. Both are tested.

### Functions

| Function | Security | Granted to |
|---|---|---|
| `create_payment_for_booking` | DEFINER | `authenticated` |
| `start_payment` | DEFINER | `authenticated` |
| `cancel_payment` | DEFINER | `authenticated` |
| `refund_payment` | DEFINER | `authenticated` |
| `process_payment_event` | **INVOKER** | `service_role` |
| `process_refund_event` | **INVOKER** | `service_role` |
| `write_audit` | DEFINER | nobody (internal) |

The two webhook processors are INVOKER on purpose — see §1.

---

## 6. Booking / payment integration

Enforced and tested:

- A booking must be **`accepted`** to be paid. Pending, declined, cancelled and
  completed bookings are all refused.
- A customer cannot pay another customer's booking, and cannot pay their own
  vendor's listing.
- A failed payment leaves the booking `accepted` and lets the customer retry.
- A succeeded payment does not change `booking_status`.
- Cancelling a paid booking is allowed; the payment remains refundable.

---

## 7. Idempotency

Four independent guards:

1. **Payment creation** — `idempotency_key` is unique. The same key returns the
   existing payment. A key belonging to another user returns *"Payment not
   found"* rather than leaking it.
2. **One live payment per booking** — the partial unique index above.
3. **Webhook replay** — `UNIQUE (provider, provider_event_id)`, combined with a
   check on `processed_at`.
4. **Refunds** — `idempotency_key` is unique; the same key returns the existing
   refund instead of refunding twice. `amount_refunded_minor` is **recomputed by
   summing succeeded refunds**, never incremented, so concurrent refunds cannot
   produce a lost update.

### Why the replay guard checks `processed_at`, not row existence

An event that arrives before its payment exists — a real race, since the
provider can be faster than our own insert — is recorded with
`processing_error = 'no matching payment'` and **left unprocessed**. The function
returns null rather than raising, because raising would roll back the very row it
just wrote.

If "already seen" meant "a row exists", that retry would then be silently
skipped and the payment would never settle. Keying on `processed_at` means the
retry still applies.

> Found by testing. The first implementation raised after recording, and the
> record vanished with the rollback.

---

## 8. Webhook boundary

`supabase/functions/payments-webhook/index.ts`:

1. Verifies an **HMAC-SHA256 over the raw body** with a constant-time compare.
   Re-serialising the body would change the signature, so the raw text is used.
2. **Fails closed** when no secret is configured — a misconfigured deployment
   rejects everything rather than waving it through.
3. Extracts event id, type and provider payment reference.
4. Calls `process_payment_event()` with the service-role key.

It contains **no business logic**. Whether a late failure can unsettle a paid
payment lives in SQL, where it is testable and cannot be bypassed.

`process_payment_event()` refuses any event with `signature_verified = false`,
even under `service_role`, so a bug in the edge function cannot silently admit
forged events.

### Responses

| Situation | Status | Why |
|---|---|---|
| Applied | 200 | |
| Bad signature | 401 | No detail — precision helps an attacker calibrate |
| Malformed / missing fields | 400 | |
| No matching payment yet | 404 | Non-2xx makes the provider **retry**, which is correct for the race in §7 |
| Database error | 500 | Provider retries |

---

## 9. Where a real provider plugs in

Two files, and nothing else:

1. **`src/services/payments/provider.ts`** — implement `PaymentProvider` with the
   provider's checkout SDK and register it. Set `VITE_PAYMENT_PROVIDER` to its
   name.
2. **`supabase/functions/payments-webhook/index.ts`** — replace `verifySignature`
   and `parseEvent` with the provider's scheme. For Razorpay: HMAC-SHA256 of the
   raw body keyed by the webhook secret, compared against `x-razorpay-signature`,
   with `payment.captured` / `payment.failed` mapped to our event names.

The payment domain, database functions, state machine, RLS and tests are
unchanged by that swap.

### The test provider is not a shortcut

`testProvider.ts` mints a deterministic reference and returns. It **cannot** mark
anything paid. Settlement still requires a signed webhook under the service role,
exactly as with a real provider — which is what makes the end-to-end test
meaningful rather than a simulation of itself. Production code contains no
"payment succeeded" shortcut.

---

## 10. Refunds

**Who may refund:** the vendor who owns the booking, or an `admin`.

**The customer deliberately cannot.** A customer-initiated refund is a dispute,
not a button, and Ocasio has no dispute process. Making it self-service would let
a customer take the money back after the work was done. A customer attempting it
gets *"Payment not found"* — the same message a stranger gets, so the endpoint
cannot be used to probe.

Partial refunds are supported at the data level. Rules:

- Only a `succeeded` or `partially_refunded` payment can be refunded.
- A refund cannot exceed `amount_minor − amount_refunded_minor`.
- Refunds start `pending` and only affect the payment once the provider
  confirms, via `process_refund_event()`.
- There is **no automated refund policy** — no cancellation windows, no
  automatic refunds on cancellation. Every refund is explicit.

---

## 11. Security posture

### RLS

| Table | anon | customer | vendor owner |
|---|---|---|---|
| `payments` | — | SELECT own | SELECT for vendors they own |
| `refunds` | — | SELECT via their payment | SELECT via their payment |
| `payment_events` | — | — | — |
| `audit_log` | — | — | — |

No INSERT, UPDATE or DELETE policy on any of them.

> **A trap worth knowing:** with no UPDATE policy, a malicious update silently
> matches zero rows and **returns success**. It does not error. Tests that assert
> "no error was returned" would pass while proving nothing — so the payment tests
> assert that the row is *unchanged*.

### What is never stored or logged

Card numbers, CVV, expiry, bank credentials, tokens and secrets. A trigger
(`reject_sensitive_payment_data`) rejects an insert or update whose `metadata`
carries keys like `cvv`, `card_number`, `access_token` or `service_role` — a
backstop in case a future caller pipes a provider payload straight through.

The service-role key never reaches the browser: it is injected into the edge
function by the platform, is never `VITE_`-prefixed, and does not appear in the
built bundle.

### Audit trail

`payment.created`, `payment.initiated`, `payment.succeeded`, `payment.failed`,
`payment.cancelled`, `refund.initiated`, `refund.succeeded`, `refund.failed` —
each with actor, entity, timestamp and the provider event id where relevant. A
test asserts no sensitive token appears in the recorded metadata.

---

## 12. Known limitations

- **No real provider.** Money does not move. Everything else is real.
- **The edge function is not covered by the automated suite.** It runs on Deno
  and needs `supabase functions serve` plus a secret. Its signature verification
  is unit-tested in `tests/webhook-signature.test.ts` against the same Web Crypto
  API, and the database side it calls is fully covered — but the HTTP handler
  itself has not been executed in CI.
- **No payouts.** Nothing moves money to vendors; there is no ledger, no
  settlement schedule and no commission.
- **No disputes or chargebacks.**
- **No automated refund policy** (§10).
- **No admin UI.** The `admin` role can refund, but nothing grants it and there
  is no interface. Approval and refunds are operator actions via `service_role`.
- **No reconciliation job.** A payment stuck in `processing` because a webhook
  never arrived stays there; nothing polls the provider.
- **Currency is fixed to INR.** The column exists but nothing selects it.

---

## 13. Testing

```bash
npx supabase start
npm test             # 167 integration + unit tests, 55 of them payments
npx playwright test  # 24 E2E, 4 of them payments (desktop + mobile)
```

Mutation-verified. Four deliberate weakenings, and what caught them:

| Mutation | Result |
|---|---|
| Grant the webhook processor to `authenticated` | 1 test failed |
| Let a customer initiate refunds | 2 tests failed |
| Ignore the booking price and charge 1 paise | 6 tests failed |
| Remove the webhook replay guard | **passed — gap found** |

The fourth initially passed because the settled-state guard masked it. A test was
added for the path where the replay guard is the *only* protection — a repeated
`payment.failed` delivery, where without it the audit log gains a duplicate
financial record. The mutation now fails that test.
