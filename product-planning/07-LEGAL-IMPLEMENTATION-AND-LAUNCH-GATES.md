# Legal implementation and launch gates

23 November 2026 · Proposed engineering/operations work derived from the [legal research](research/INDIA-LAUNCH-LEGAL-RESEARCH.md). No row is claimed implemented, legally approved or verified. Statutory applicability and policy wording need qualified review; architecture decisions remain founder-review items. The founder clarified the typo as CSRF protection; its implementation belongs to application security.

## Confirmed decisions and immediate consequences

Vendor terms define service-payment timing; vendor acceptance still confirms without deposit. One-time and recurring vendor charges are supported and payable after approval. Exact plan combination, intervals, prices, activation, refunds and autopay are not decided. Standard Ocasio cancellation policy is selected in principle, but no tariff is approved.

The payment schedule editor must therefore distinguish `confirmation` from `payment_due`. Reject or route contradictory terms for review before publishing. Unpaid confirmed services are real commitments; overdue handling and cancellation liability need explicit approved rules. Neither a later debit nor automatic cancellation is authorised by this document.

## Proposed NestJS modules and PostgreSQL records

| Capability | Data/commands proposed | Required staff/customer experience |
|---|---|---|
| Policy registry | Policy identifier/version, locale, effective dates, applicability, draft/review/publish, acceptance reference | Terms visible before commitment; historical version retrievable |
| Grievances | Received timestamp, category/regime, acknowledgement/due times, officer, complaint copy, history, outcome/execution | Submit/track case, accessible officer details, copy/download, escalation |
| Vendor legal profile | Business/seller fields, declaration version, contacts, applicable IDs, private evidence/public disclosure split | Completeness check before publication; correction queue |
| Cancellation assessment | Booking/component, policy snapshot, actor/reason, preview, charge/refund basis, approval, financial execution | Explain effect before confirmation; preserve unaffected package components |
| Vendor billing | Approved vendor, accepted fee schedule, one-time invoice, subscription/renewal, optional mandate reference | Clear amount/frequency, invoice/history, cancel/renewal controls |
| Privacy purposes/choices | Purpose and notice versions, action evidence, withdrawal, recipient/purpose disclosures | Specific understandable choices; optional marketing separate |
| Data request cases | Identity verification, requested action, systems/processors, legal hold, response and closure evidence | Status and reviewed explanation when retention limits erasure |
| Media permissions | Asset provenance, depicted-person/guardian evidence where needed, publication purpose, revocation/takedown | Distinguish private reference upload from public marketing rights |
| Security incidents | Awareness time, affected systems/data, classification, reporting clock, recipient/channel, updates | Restricted incident workspace and accountable on-call owner |
| Compliance evidence | Control/source/version, owner, effective date, test evidence, review, approval, next check | Staff can show what is done and what remains open |

These are domain proposals, not instructions to collect all possible identity documents. Final data fields and retention must be necessary, proportionate and reviewed. Do not build one “all permissions granted” boolean.

## Control register

All controls start **Open / not verified**. Owners below are proposed capabilities, not appointed people. Source details and commencement distinctions are in the research document.

| ID | Work/control | Proposed owner | Evidence needed / release gate |
|---|---|---|---|
| L01 | Determine entity, contracting parties and marketplace/assistance roles | Founders + counsel | Signed role/money-flow memo and approved identity/signatory details |
| L02 | Legal disclosure publishing | Legal/content + engineering | Correct platform/seller contact and required identity fields publicly available; private evidence remains protected |
| L03 | Consumer grievance process | Appointed officer + support | Submission reference, receipt clock, acknowledgement and redress tracking; escalation before deadlines; no clock pause merely awaiting supplier |
| L04 | 2027 complaint-copy readiness | Support + engineering | Customer receives/retrieves the complaint as recorded; revisions auditable |
| L05 | NCH convergence | Compliance operations | Applicable onboarding process completed and operating route documented for 2027 requirement |
| L06 | Vendor undertakings and agreements | Supplier operations + counsel | Accepted version and supplier authority stored; disclosure accuracy and standard policy incorporated |
| L07 | Cancellation policy review | Counsel + founders | Voluntary cancellation versus vendor failure/deficiency separated; charge symmetry and unpaid-service liability reviewed; no unapproved percentages |
| L08 | Refund responsibility and execution | Finance + provider | Who owes/executes each refund documented; direct and platform routes tested, pending/failure visible |
| L09 | Price/ranking transparency | Product + content | Main ranking explanation published; sponsorship labels where relevant; actual fee basis shown |
| L10 | 2027 price/invoice changes | Finance + engineering | Relevant prior-price history, supplier invoice attribution and approved invoice template tested |
| L11 | Dark-pattern review | Product + compliance | No preselected assistance, false urgency, hidden fees or obstructed cancellation; audit findings/fixes retained; applicable annual certificate based on actual review |
| L12 | Multi-vendor agreement integrity | Product + counsel | Each supplier, component price/scope, status and applicable terms identifiable; replacement does not silently amend accepted components |
| L13 | Paid assistance authority | Operations + counsel | Customer-approved scope, premium, responsible person, spending/change limits; on-site confirmation tracked separately |
| L14 | Provider-approved customer payment flow | Finance + counsel + provider | Written merchant/submerchant/settlement arrangement and sandbox/reconciliation evidence; no informal pooled collection |
| L15 | Vendor fee acceptance | Commercial + finance | Approval precedes charging; amounts/intervals and plan selection accepted; approval is not an autopay mandate |
| L16 | Recurring collection controls | Finance + provider | Manual versus autopay chosen; mandate lifecycle, required notices, revocation, failure and duplicate events tested |
| L17 | Tax classification and invoices | CA + finance | Service/category/money-flow assessment, applicable registrations/TCS/special-category treatment and credit-note workflow approved |
| L18 | Processing inventory | Privacy owner + engineering | Every field/purpose mapped to access, legal basis review, recipients/processors, retention and deletion |
| L19 | Versioned notices and consent | Privacy owner + product | Understandable collection notices and records; withdrawal affects relevant processing rather than just hiding a toggle |
| L20 | Vendor/customer data sharing | Privacy + supplier operations | Necessary data only, at approved stage; disclosure history and vendor/provider contracts; supplier role assessed per activity |
| L21 | Rights/grievance request workflow | Privacy + support | Identity-safe access/correction/erasure/grievance/nomination flows prepared for applicable DPDP duties; professional wording reviewed |
| L22 | Children/guest media | Privacy + content | Private/public use separated; required depicted-person/guardian evidence and takedown flow validated; organiser checkbox not treated as universal permission |
| L23 | Retention and legal holds | Privacy + finance/security | Reviewed schedule reconciles current/future minimums, purpose expiry and required financial/dispute records; processor/backups handled |
| L24 | Security baseline and incident response | Security owner | Access tests, private files, backups, logs/location, time sync, designated contact and incident-reporting rehearsal |
| L25 | Distinct incident reporting clocks | Security + legal | CERT-In applicability assessed separately from future DPDP; initial reporting not postponed for completed investigation |
| L26 | Content/review compliance | Trust + counsel | Eligibility, fake-review controls, policy-based moderation, IP/privacy complaints; current intermediary analysis and BIS status reviewed |
| L27 | Category/local permissions | Supplier operations + counsel | Enable categories/localities only after relevant food/venue/sound/music/transport/other checks are defined |
| L28 | Communications compliance | Marketing/operations + provider | Appropriate sender/template setup, service/promotional distinction, opt-out/consent and provider contract evidence |
| L29 | Current-law recheck | Compliance owner | Source/date register checked before launch and relevant future effective dates; unresolved interpretations listed |
| L30 | CSRF protection (clarified founder requirement) | Security + engineering | Session-aware protection and negative tests for state-changing requests; see architecture requirements. Clarification resolved; implementation not verified |

## Additional acceptance scenarios

1. Vendor accepts without customer payment: capacity commits and booking becomes confirmed; finance shows the disclosed unpaid obligation without mislabelling it overdue.
2. Vendor tries to publish terms requiring deposit before confirmation: system flags inconsistency for correction/review; it does not override founder policy silently.
3. Vendor has been approved but has not accepted a fee schedule: no automatic invoice debit/mandate creation.
4. A recurring charge fails: finance shows failure and follows approved grace policy; existing customer bookings are not erased or silently cancelled.
5. Customer declines premium assistance: requested supplier booking remains possible without secretly adding the premium.
6. Customer cancels unpaid confirmed service: preview explains any approved contractual liability; system does not fabricate a refund or collect an unmandated debit.
7. Paid cancellation with a pending provider response: case shows approved-but-not-yet-completed refund; retry cannot double-pay.
8. One component fails: only that component needs replacement; customer sees changed supplier/scope/price before approving.
9. A complaint arrives outside normal support hours: receipt and applicable deadline tracking still work; waiting for vendor input does not reset receipt.
10. Customer requests deletion during an active dispute: reviewed holds preserve only necessary records; response explains restrictions without falsely promising total erasure.
11. Public media permission is absent: asset can remain private where lawful/needed but cannot publish as portfolio/advertising automatically.
12. Security incident drill: awareness, classification, reporting and updates have timestamps and a reachable owner; future DPDP clock is not substituted for current CERT-In review.

## Launch evidence pack

Maintain approved documents, applicability decisions, appointed officers, fee/policy versions, provider approvals, CA assessment, category checks, processing inventory, test results, incident/restore drills, audit findings and unresolved exceptions. Engineering completion and legal approval are separate gates. Do not represent this research pack as a compliance certificate.

## Founder/professional decisions still needed

Legal entity; date of launch; one-time plus recurring charge design/amounts/periods; commission trigger/base; overdue handling; cancellation time bands/amounts and funding; assistance limits; direct-vendor evidence/refunds; collection provider; category list; staff responsibilities; children/media process; retention schedule; permitted cross-border providers; contract and policy approval.
