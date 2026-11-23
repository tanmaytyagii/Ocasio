# 05 · Acceptance and delivery gates

This is a proposed verification plan, not a claim that tests ran or any feature is complete. It separates the full product vision from implementation sequencing. Every enabled journey must be end to end; a delivery sequence is not permission to ship disconnected buttons.

The [final phased implementation plan](08-PHASED-IMPLEMENTATION-PLAN.md) supersedes the preliminary sequence below. Vendor acceptance confirms without deposit; payments and confirmations remain separate.

## Feature contract template

Before implementing any feature record: feature/page IDs; customer or operator problem; approved decisions; actor and resource permissions; entry/exit conditions; UI states; input/output schema; server rules; data changes; external dependencies; failure/retry/concurrency behaviour; notifications; analytics definitions; operational owner; acceptance evidence; rollout and rollback plan.

If a required business rule remains open, the dependent behaviour is not implementation ready. Design and research may continue without choosing the rule silently. A hidden or disabled flow needs an honest explanation when visible.

## Traceable acceptance scenarios

| Test ID | Feature/workflow | Observable evidence required |
|---|---|---|
| A01 | P01–P09 discovery | Published content and real serviceability appear; withdrawn/private supplier records do not leak through search or direct URL |
| A02 | P04–P05 inspiration | Actual-work/concept labels and provenance retained; idea reference reaches saved brief without becoming an order |
| A03 | P07/P10 price comparison | Different units/exclusions visible; missing fees never treated as included or zero |
| A04 | P15–P19 brief/auth | Save, sign-in, recovery and resume preserve the correct user's draft; cross-account access denied |
| A05 | W01 request dispatch | Double submit creates one request; consent/recipient snapshot persisted; notification outage produces recoverable delivery record |
| A06 | W02 admission | Unapproved supplier cannot self-publish or award badges; staff decision identifies evidence scope and reason |
| A07 | P31/P35 uploads | Invalid/oversized/unsafe file rejected; private evidence never accessible through public media URLs |
| A08 | W03 quote integrity | Issued version immutable; revised/expired version rejected; accepted terms unaffected by live service edits |
| A09 | W03 capacity | Concurrent vendor acceptances of customer requests sharing one remaining resource yield one confirmed commitment without deposit; the other request receives an actionable conflict |
| A10 | W03 idempotency | Retry after timeout returns prior effect; same key with changed payload rejected; no duplicate booking |
| A11 | W04 payment | Browser callback cannot set success; signed provider event matched to amount/currency/obligation; duplicate events have no duplicate effect |
| A12 | W04 uncertainty | Closed tab, delayed/out-of-order callback and provider timeout recover through authoritative records and reconciliation |
| A13 | W04 payment/booking independence | Payment timeout/delay cannot silently expire a vendor-confirmed booking. Payment against cancelled/incompatible obligations follows approved reconciliation; never confirms from payment alone |
| A14 | W06 amendment | Pending/declined amendment leaves old agreement; accepted amendment records approvals, fresh capacity and financial consequences |
| A15 | W06 cancellation | Cancellation and refund visibly separate; resource release and competing payment actions remain consistent |
| A16 | P39/P45 refunds | Concurrent partial refunds cannot exceed eligible funds including in-flight amounts; provider ambiguity remains pending, not retried blindly |
| A17 | P23 multi-service | One supplier decline leaves confirmed components booked while customer selects a replacement; no automatic cross-component cancellation |
| A18 | P27 support | Case reaches real staff queue; remedy approval and execution separately tracked; failed refund prevents false closure |
| A19 | P28 reviews | Approved eligibility enforced server-side; vendor cannot erase criticism or block legitimate eligibility by withholding a status action |
| A20 | P34/P49 permissions | Swapped IDs, revoked memberships and direct API calls cannot read/modify other organisations, addresses, finance or evidence |
| A21 | P29 privacy | Data request/closure follows documented access and retention rules; active-booking implications visible |
| A22 | P46 publishing | Draft/preview not publicly cached; publish/withdraw invalidates relevant pages/search; prior booking agreement remains intact |
| A23 | All interactive pages | Keyboard, focus, labels, errors, dialogs, mobile layouts and relevant assistive-technology checks against approved target |
| A24 | Deployment/operations | Migration tested, rollback limitations understood, backup restored in rehearsal and critical exception alert reaches named operator |

Payment tests are conditional on integrated payment. Direct-vendor payment needs equivalent tests of receipt claims, verification, disputes and commission receivables instead; do not mark the financial journey complete just because there is no checkout.

## Proposed test layers

Use unit tests for pricing units/rounding, eligibility predicates and policy calculations after approval. Use real PostgreSQL integration tests for transactions, constraints, permission scoping and concurrent acceptance/refunds. Test provider adapters against documented contracts and sandbox behaviour where available. Browser journeys should cross customer, vendor and staff actions using persisted records. Include external outage, delayed processing, retries and stale tabs—not only happy-path screenshots.

Avoid brittle tests that simply mirror component internals. Validate outcomes and invariants. Keep fixtures synthetic and distinguish them from production testimonials, ratings or transactions.

## Delivery sequence proposals

1. **Decision and experience gate:** settle transaction/role boundaries; approve page families, service scope, actual brand claims, permission matrix and key journey designs.
2. **Foundation gate:** Next.js/NestJS/PostgreSQL skeleton, environments, identity choice, API contracts, media safety, audit/outbox and public content model. Verify a complete published discovery slice.
3. **Supplier and discovery gate:** admission through checked publishing, real coverage, inspiration-to-brief context and operational content ownership.
4. **Offer-to-commitment gate:** brief submission, supplier response, immutable quote, comparison, reservation and authoritative confirmation under approved rules.
5. **Money and operations gate:** chosen payment route, cancellation/amendment, support, reconciliation and staff recovery. Transactions stay unavailable publicly until this gate is proven.
6. **Fulfilment and reputation gate:** readiness, completion/issue handling, review eligibility, moderation and privacy workflows.
7. **Production gate:** approved enabled scope works across roles; external integrations configured; accessibility/performance/security findings resolved to agreed standard; restore/incident drills completed; accurate content and support ownership confirmed.

These gates may overlap in development. They are not dates or estimates. Staffing/time/cost estimation follows scope and policy decisions. Advanced AI, native apps and public social feeds are separate candidate projects, not mandatory signs of maturity. One-time and recurring vendor charges after approval are confirmed core scope; advanced subscription features beyond those charges remain optional.

## Measurement definitions

Define event names and consent before analytics integration. Candidate milestones: idea saved, brief saved/submitted, request delivered, valid quote received, quote accepted, booking confirmed, payment verified, service delivered, issue resolved and review published. Distinguish events from vendor bookings and attempts from successful payments. Do not transmit raw address, contact details, documents or message bodies into analytics.

Product reporting needs abandoned/stalled steps and exception rates alongside conversion. Operational reporting needs delivery lateness, supplier cancellation, support response/resolution and failed financial execution. Financial reporting must distinguish booking value, collected funds, earned platform fees, refunds, vendor payables and actual contribution under the approved accounting treatment.

## Honest completion standard

For each enabled feature, evidence must cover real UI → validated API → durable data → permitted state transition → truthful outcome → external delivery where relevant → staff investigation/recovery → tests and monitoring. A confirmation toast, mock checkout, static dashboard or contact form without a receiving process does not satisfy this standard.
