# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for a security vulnerability.

Report it privately through GitHub's
[private vulnerability reporting](https://github.com/tanmaytyagii/Ocasio/security/advisories/new)
on this repository. Include what you found, how to reproduce it, and what an
attacker could do with it.

## Scope

This is a portfolio project without a production deployment, so there is no
live system to attack and no user data at risk. Reports are still welcome —
particularly anything that would let a client bypass the guarantees below.

## What the project guarantees

These are enforced in Postgres and covered by tests. A way around any of them is
a genuine vulnerability:

- A user cannot read or modify another user's bookings, payments, refunds,
  favourites or profile.
- A user cannot set their own role or grant themselves vendor access —
  including by writing `user_metadata`.
- A vendor cannot modify another vendor's listing, services, bookings or
  payments.
- A vendor cannot write their own rating or review count, or create a review of
  their own business.
- A payment amount cannot be influenced by the client; it is derived from the
  booking server-side and frozen thereafter.
- A payment cannot reach a settled state except through a signature-verified
  webhook processed under the service role.
- A customer cannot refund their own payment.
- A review requires a completed booking owned by the reviewer, one per booking.
- Webhook events cannot be replayed to double-apply an outcome.

## What is deliberately not secured

- **The Supabase anon key is public by design.** It ships in the client bundle.
  It is only safe because RLS is enabled on every table — which is the actual
  boundary.
- **No real payment provider is connected**, so there is no live money path.
- **Edge functions are not exercised in CI.** Their signature verification is
  unit-tested; the database functions they call are fully covered.

## Known limitations

See [Current limitations](README.md#current-limitations) and
[`docs/OCASIO_DATA_RETENTION.md`](docs/OCASIO_DATA_RETENTION.md).
