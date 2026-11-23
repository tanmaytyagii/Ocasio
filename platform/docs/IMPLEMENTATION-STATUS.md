# Implementation status and boundaries

Status: Phase 0 partial; Phase 2 partial; Phase 3 security/session work started. Email/password identity and configurable Google integration are implemented; no phase-wide production approval, payment provider or legal approval is established here.

## Foundation scope

The workspace now runs a Next.js frontend, NestJS read-only API, PostgreSQL, shared runtime contracts, checksum-tracked migrations and a diagnostic outbox worker. Local setup, backup, doctor and CI configuration are included. [Verification evidence](VERIFICATION.md) records executed checks and the restore rehearsal; it distinguishes these from future work.

Any displayed sample content must be labelled as development material. No fixture, city name, service card or public route establishes a real vendor relationship, approved supplier, bookable market, valid review or successful transaction. Intended geography remains Delhi NCR, Karnal and Muzaffarnagar; exact supported localities/categories remain unconfirmed.

## Confirmed decisions to preserve in future implementation

- Customers choose vendors from Ocasio recommendations; individual services and customer-customisable multi-vendor packages are intended.
- Pricing supports fixed offers and personalised quotes by service; each customer request requires vendor reconfirmation.
- Vendor acceptance confirms without a deposit. Payment due dates and subsequent obligations follow disclosed vendor-specific schedules.
- Confirmed components remain booked when another package component declines; the customer chooses a replacement for that component.
- Customer onboarding is free. Vendor revenue includes commission plus one-time and recurring charges payable after approval. Whether both charges apply to each vendor or are alternative plans remains open.
- Optional personalised assistance is paid and covers sourcing, booking, follow-ups, coordination and event-day assistance. On-site help is subject to separately confirmed availability.
- Customers choose direct-vendor or through-Ocasio service payment. Both need complete route-specific operational and provider/legal feasibility work.
- A standard Ocasio cancellation policy is selected in principle; no percentages, time bands or unpaid-service liability rules are approved.

## Pending gates

Anonymous PostgreSQL-backed sessions, CSRF verification on routed unsafe API commands, same-origin API forwarding and basic web security headers are now implemented. [Security scope](SECURITY.md) describes tests and boundaries. Better Auth now establishes account identity with required email verification, password recovery/revocation and optional configured Google. Ownership checks, vendor organisation membership and staff permissions remain pending; no business resource mutation is exposed.

Before accepting real transactional work, implement and verify customer identity/resource access control, vendor admission/evidence and commercial acceptance, real catalogue publishing/coverage, immutable offers, vendor acceptance/capacity integrity, package replacement, assistance assignment/authority, both money routes, billing/reconciliation, changes/cancellation/remedies, grievance/support operations, completion/reviews and data lifecycle controls.

Still open: vendor fee amounts/intervals/combination, activation and overdue policy, commission base/trigger, payment-provider eligibility, recurring mandate design, assistance pricing/hours/authority/refunds, standard cancellation details, completion/review rules, admission criteria, exact coverage, category requirements, operating staffing and approved legal/tax/privacy arrangements.

Production release requires evidence across complete journeys, negative permission/concurrency tests, operational ownership, recovery/incident rehearsal, accessibility/performance/security review and applicable professional sign-off. A working local page or an API health check does not satisfy those gates.

## Identity increment

Founder selected email/password plus Google. Real account pages and native library auth endpoints are implemented. Google is disabled without credentials; no real provider login or production SMTP delivery is claimed. Local Mailpit captures verification/recovery mail. Encrypted queue payloads use bounded retries and leases; successful SMTP handoff clears ciphertext. Auth identity and the CSRF-context session are separate. See [setup](AUTH-SETUP.md), [security](SECURITY.md) and [verification](VERIFICATION.md).
