# 03 · Proposed domain and end-to-end workflows

All models below are design candidates. Names, cardinalities and business transitions require review. PostgreSQL is proposed because accepted agreements, permissions, supplier capacity and financial references have relational consistency requirements; selecting this SQL design follows the founder's PostgreSQL instruction.

## Current confirmation contract

The customer submits or assents to a specific offer/request version; this does not itself confirm. The vendor explicitly accepts that exact customer-approved version. NestJS atomically checks authority, eligibility and capacity, then commits a confirmed booking and resources without requiring a deposit. Revised scope/price returns to the customer for assent. Disclosed payment obligations are separate; overdue consequences follow approved policy, never an implicit deposit prerequisite.

## Vocabulary and entity boundaries

| Entity | Purpose and representative data | Integrity boundary |
|---|---|---|
| Account / membership | Identity, organisation membership, scoped permissions | A role alone does not grant access to every vendor/customer |
| Vendor business / branch | Legal/business identity, public profile, operational contacts | Public data separated from private evidence and finance data |
| Application / evidence check | Submitted version, reviewer, subject, method, evidence, outcome, expiry | Admission, public visibility and permission to accept work are separate |
| Coverage / eligibility | Locality identifiers, categories, travel constraints, effective period | A city landing page is not proof of serviceability |
| Occasion / collaborator | Customer-owned event context and optional invitations | Optional organising entity; not automatically a combined contract |
| Brief / brief version | Requirements, date certainty, budget basis, location precision, references | Suppliers quote against an identified version |
| Idea / media asset | Editorial context, provenance, rights, concept/actual-work label | Inspiration does not assert price or bookability |
| Service / package / option | Scope template, price units, dependencies, publish state | Live catalogue changes do not change agreed terms |
| Request / recipient | Brief version, selected suppliers, shared fields, response status | Record exactly what was shared and with whom |
| Quote / quote version / line item | Supplier, scope, amounts, units, validity, policy and milestones | Issued versions immutable; supersession explicit |
| Resource / reservation | Crew/equipment/time interval, buffers, hold expiry | Availability checked transactionally, not from a cached UI |
| Booking / agreement version | Parties, accepted offer, effective terms, confirmation prerequisites | Booking identity separate from current catalogue and payment state |
| Amendment | Requested changes, before/after terms, approvals and effective version | Pending proposal does not rewrite existing obligations |
| Payment obligation | Amount due, currency, milestone, payer/payee, external route | Obligation is not proof of collected funds |
| Payment attempt / provider event | Operation reference, amount, provider ID, verified event history | Deduplicate, reconcile, preserve uncertain outcomes |
| Receipt claim / verification | Direct-to-vendor payment evidence and review result | Customer/vendor claim is not automatically verified payment |
| Refund / fee receivable / settlement | Conditional money-flow records | Each has its own authority, amount and lifecycle |
| Fulfilment record | Readiness, attendance/delivery evidence, completion claim/disagreement | Completion and review eligibility need approved rules |
| Support case / resolution | Statements, evidence, ownership, remedy, execution references | Approved remedy does not imply executed refund/replacement |
| Review / response / moderation | Eligibility basis, publication state, content, policy decisions | Vendor cannot silently edit customer feedback |
| Notification / outbox / audit | Durable event, intended recipient, delivery/retry history, actor/reason | Notification success is separate from business success |

This is not a final migration schema. Decide D01–D10, D17 and D28 before fixing the financial and booking relationships. Avoid storing every proposed feature as an unvalidated free-form JSON blob; use explicit domain fields plus validated category-specific extensions.

## Proposed state dimensions

| Object | Candidate lifecycle | Unresolved rules |
|---|---|---|
| Application | draft → submitted → reviewing → corrections_requested → resubmitted → approved/rejected/withdrawn | Evidence, appeal, reapplication and decision authority |
| Vendor eligibility | not_live → live → restricted/suspended → reinstated/offboarded | Category/locality restrictions and existing-booking handling |
| Request | draft → submitted → clarification/matching → proposals_received → selected/closed | Who distributes, recipient limits and time commitments |
| Quote version | draft → issued → accepted/declined/expired/withdrawn/superseded | Validity duration and whether a hold accompanies issue |
| Reservation | held → confirmed/released/expired | Resource granularity and hold timing |
| Booking | provisional → confirmed → completed/cancelled | Vendor acceptance is the confirmed binding product transition; completion actor/disputes remain open |
| Fulfilment | scheduled → preparing → ready → delivered/issue_reported | Evidence and customer confirmation |
| Payment attempt | created → pending → succeeded/failed/abandoned | Provider terminology and authoritative finality |
| Refund | requested → approved/rejected → processing → succeeded/failed | Eligibility, authority and provider recovery |
| Amendment | draft → proposed → accepted/declined/withdrawn/expired | Financial prerequisites and effective time |
| Support case | opened → triaged → investigating/awaiting_party → resolution_proposed → execution_pending → resolved/reopened | Escalation, appeals and closure conditions |

Refunds do not overwrite payment history; a successful payment may have one or more linked partial refunds. Financial aggregates derive from records rather than a single overloaded status. Financial settlement exists only if the approved payment model includes it.

## Workflow W01 · Discover and prepare a brief

Entry: visitor chooses an occasion, idea, supplier or service. Frontend preserves context and allows exploration without claiming availability. Brief saves carry an operation identifier and version. Backend validates field formats, category requirements and access, then persists the draft. Upon submission, the customer sees intended recipients and shared information under the approved policy. Request and dispatch events commit durably; message delivery is retried independently. Empty matches produce an honest pending/no-match outcome, not a fabricated supplier recommendation.

Unresolved: guest submission, mandatory fields, automatic versus staff matching, recipient count, follow-up timing and outreach permissions.

## Workflow W02 · Supplier admission and publishing

Vendor saves an application and private evidence. Uploads go through validation/quarantine before staff can use them. Submission creates one review case with an owner. Reviewer requests corrections or records a decision against the submitted version and evidence scope. Approval does not automatically publish an incomplete profile or enable every category/locality. Public profile and checks publish through an explicit action with audit history. Restrictions stop new commitments while staff manage existing obligations separately.

Unresolved: required documents, verification provider, references, rechecks, commercial onboarding, subcontracting and appeals.

## Workflow W03 · Quote preparation and acceptance

1. Authorised supplier receives a specific brief version and clarifies requirements.
2. Quote editor records line items, quantity/unit, setup/service/teardown, inclusions/exclusions, dependencies, currency, approved fee/tax treatment, milestones, terms and validity.
3. Server derives totals and validates scope. Issuing creates an immutable version.
4. Customer reviews or compares the version. Clarification is not acceptance.
5. Customer assent/request identifies the agreed quote version. Vendor reconfirmation is a separate command with version, operation key and expected state.
6. In a PostgreSQL transaction, NestJS rechecks vendor authority, customer-approved terms, vendor eligibility, offer expiry/supersession and resource capacity. The authoritative vendor-acceptance operation locks the relevant resources/records and either commits the confirmed booking/capacity plus outbox events or returns a conflict.
7. Vendor acceptance confirms without deposit. Record unpaid/not-yet-due obligations separately. Do not hold a database transaction open during an external payment call.

Fixed-price packages skip bespoke pricing where appropriate, but still require vendor acceptance after the customer request. There is no instant-confirmation mode selected.

## Workflow W04 · Confirmation and money

Both direct-vendor and through-Ocasio routes are intended, selected by the customer. Resolve execution details under D06/D08/D28 before activating collection:

| Option | Complete system behaviour required |
|---|---|
| Vendor paid directly | Record schedule and references; submit/verify receipts under policy; issue and collect any platform receivable; handle disputed payment claims. No fake Ocasio checkout |
| Ocasio fee only | Separate platform service payment from vendor service obligation and their refund rules |
| Approved marketplace collection | Provider-approved onboarding, server-created orders, verified callbacks, refunds, settlement/transfer records and reconciliation |
| Category-specific combination | Booking explicitly names payment route and obligations; operations handle each route separately |

For integrated payment: commit intended attempt → call provider with stable operation reference → record response or uncertain state → receive signature-verified callback → deduplicate event → validate provider reference/amount/currency/ownership → update authoritative money records → update payment obligations without replacing vendor-acceptance confirmation → notify. Browser redirects read state; they never set success. Scheduled reconciliation repairs missing callbacks or raises an exception.

Vendor acceptance already commits confirmed capacity without deposit. Payment delay, browser closure or a provider timeout cannot silently expire that booking. If payment occurs against a genuinely cancelled or otherwise incompatible obligation, reconcile it using approved recovery/refund rules. Never infer confirmation from payment alone.

## Workflow W05 · Prepare, deliver and complete

Record readiness requirements and customer/vendor dependencies with responsible actors. Show setup, service and removal time separately. Escalate missing readiness according to approved timing. Delivery evidence and completion claims are recorded; disputes preserve both parties' statements. Completion/review eligibility must not be irrevocably controlled by a conflicted vendor declaration. Closure, fee recognition and any payout eligibility are separate approved rules.

## Workflow W06 · Changes, cancellation and remedies

Propose amendment → calculate before/after scope, capacity and financial consequences → obtain required acceptance → validate fresh capacity → create new agreement version → execute linked financial changes → publish effective outcome. A declined/expired amendment leaves the original agreement intact.

Cancellation preview uses the agreed policy version and actual event timeline. Submission records actor/reason/effective time and coordinates resource release with money processing. A cancellation acknowledgement is not a refund receipt. No-show, postponement, weather, partial delivery and supplier cancellation need distinct approved policies.

Support triages evidence → proposes remedy → obtains required authority/customer acceptance → executes replacement/amendment/refund → confirms outcome → closes case. Failed execution keeps the case actionable.

## Non-negotiable integrity properties of any approved transaction design

- Server derives actor, ownership, permissions, prices and transitions; client sends intent.
- Use integer minor units for money, explicit currency and defined rounding. Never sum floating-point prices or accept client totals.
- Preserve accepted terms, price breakdown, fee/policy versions and acceptance evidence.
- One operation key maps to one effect; reusing it with conflicting payload is rejected.
- Capacity is a resource/time problem including setup, teardown and travel buffers where applicable, not only a count of bookings on a date.
- Use UTC instants plus event timezone for precise timestamps; preserve date-only/flexible dates as such. Store displayed commercial deadlines unambiguously.
- Events, supplier bookings and payments have distinct identifiers and totals.
- Concurrent transitions require expected-version checks, locks/constraints and bounded whole-transaction retries where appropriate.
- Notification failure cannot roll back a confirmed booking after the fact; a durable retry record is needed.
- Sensitive evidence, customer addresses and financial exports have object/field-level access rules.

## Edge-case test inventory

Last supplier slot accepted concurrently; two quote versions accepted from two tabs; expired offer; withdrawn vendor; supplier suspended with upcoming bookings; two jobs sharing one crew; multi-day/cross-midnight/setup-day conflict; changed site restrictions; unsupported postcode; quote units misunderstood; invitation leaked; collaborator lacking spending authority; payment succeeds after browser closes; provider timeout with unknown creation outcome; duplicate/out-of-order callbacks; cancellation races payment; refund times out after provider execution; competing partial refunds; external WhatsApp agreement differs from accepted terms; vendor no-show; substitute crew; customer disputes completion; review report; active booking during account closure; queue outage; worker retry after database commit.

Each scenario needs a chosen policy where applicable, a server invariant, a customer-visible outcome and a staff recovery path. A scenario is not resolved by merely catching an exception.
