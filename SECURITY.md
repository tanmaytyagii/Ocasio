# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security vulnerability.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/tanmaytyagii/Ocasio/security/advisories/new)
on this repository. Include what you found, how to reproduce it, and what an
attacker could do with it.

If the private reporting form is unavailable, open an issue titled "Security
contact request" with **no details** of the problem, and the maintainer will
arrange a private channel.

If you find a credential in the repository or its history, report its location
(file and commit), not its value. The one known historical key is listed below.

Only `main` is supported; fixes land there.

## Scope

This is a portfolio project without a production deployment, so there is no
live system to attack and no user data at risk. Reports are still welcome,
particularly anything that would let a client bypass the guarantees below.

The most recent audit — every finding, its evidence, its fix and what remains
open — is [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md).

## What the project guarantees

These are enforced in Postgres or the edge functions and covered by tests. A way
around any of them is a genuine vulnerability:

- A user cannot read or modify another user's bookings, payments, refunds,
  favourites or profile.
- A user cannot set their own role or grant themselves vendor access —
  including by writing `user_metadata`.
- A vendor cannot modify another vendor's listing, services, bookings or
  payments.
- A vendor cannot write their own rating or review count, or create a review of
  their own business.
- A vendor cannot accept more bookings for one date than their daily capacity,
  including by two acceptances at the same moment.
- A payment amount cannot be influenced by the client; it is derived from the
  booking server-side and frozen thereafter.
- A payment cannot reach a settled state except through a signature-verified
  webhook processed under the service role.
- A customer cannot refund their own payment.
- A review requires a completed booking owned by the reviewer, one per booking.
- Webhook events cannot be replayed to double-apply an outcome.
- A Razorpay payment is settled only by a webhook whose HMAC-SHA256 signature
  verifies over the raw body, and whose amount, currency and order match the
  stored payment. The browser never states an amount, cannot attach an order,
  and cannot create a second order for a booking.
- A refund is requested from Razorpay at most once per refund (the refund's id
  is Razorpay's idempotency key), and pending refunds count against the
  refundable balance, so concurrent requests cannot exceed what was paid.
- The reconciliation sweep (`payments-reconcile`) runs only for a caller holding
  the service-role key. The public anon key — itself a valid JWT — is refused.
- The audit log cannot be written by any client role, directly or through
  `write_audit()`. The application writes it only from inside the database
  functions that perform the audited action.
- The anonymous role holds no table privilege outside RLS (`TRUNCATE`,
  `TRIGGER`, `REFERENCES` are revoked) and cannot execute the signed-in RPCs.

## What is deliberately not secured

- **The Supabase anon key is public by design.** It ships in the client bundle.
  It is only safe because RLS is enabled on every table — which is the actual
  boundary.
- **Razorpay is integrated but not activated**, so there is no live money path
  until production keys and a webhook are configured.
- **Accepted trade-offs**, each explained in the audit: `style-src
  'unsafe-inline'` (required by Razorpay Checkout, F-13), CORS `*` on the
  browser-facing functions, which authenticate by bearer token and never by
  cookie (F-14), and sessions in `localStorage` (F-15).

## Known issues and residual risk

- **F-10:** the first commit contains the anon key of a hosted Supabase project.
  An anon key is public by design, but it identifies a real project; the owner
  must rotate its JWT secret or retire it
  ([launch checklist](docs/OCASIO_DEPLOYMENT.md#7-launch-checklist)).
- Payment reconciliation, audit-event alerting, Razorpay webhook-failure
  monitoring and a first live payment are open:
  [residual risks](docs/SECURITY_AUDIT.md#residual-risks).
- Product limitations: [Known limitations](README.md#known-limitations) and
  [`docs/OCASIO_DATA_RETENTION.md`](docs/OCASIO_DATA_RETENTION.md).
