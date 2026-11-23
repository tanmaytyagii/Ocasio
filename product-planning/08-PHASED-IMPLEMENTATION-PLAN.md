# Ocasio · Final phased implementation plan

Version 1.0 · 23 November 2026 · Implementation authorised; initial local foundation started

Current evidence: [platform verification](../platform/docs/VERIFICATION.md). Phases 0 and 2 remain partial; Phase 3 now includes tested anonymous sessions and CSRF, with customer identity/resource permissions still gated. Public pages remain provisional experience scaffolding. This does not mark all product/policy gates approved or later phases complete.

This is the consolidated execution plan for the intended production website. It supersedes the preliminary sequence in document 05. It is derived from the founder-confirmed concept and planning documents, not the historical application. “Final” means the delivery structure is complete enough to review and execute phase by phase; it does not turn unresolved policies into approved decisions.

Companion references: [current decisions](01-VISION-AND-DECISIONS.md), [page specifications P01–P50](02-PAGES-AND-EXPERIENCE.md), [domain/workflows](03-DOMAIN-AND-WORKFLOWS.md), [architecture](04-TECHNICAL-ARCHITECTURE.md), [acceptance A01–A24](05-ACCEPTANCE-AND-DELIVERY.md), [legal gates L01–L30](07-LEGAL-IMPLEMENTATION-AND-LAUNCH-GATES.md), [execution backlog and coverage](09-EXECUTION-BACKLOG-AND-COVERAGE.md).

## 1. Rules carried into every phase

| Confirmed rule | Implementation consequence |
|---|---|
| Next.js frontend; NestJS backend; PostgreSQL for SQL | Fresh architecture with authoritative backend rules; no inheritance from old app |
| Individual services plus multi-vendor packages | Model each component's supplier, agreed scope, price and status |
| Customer chooses from Ocasio recommendations | Useful supplier brand profiles and transparent recommendation experience; no silent assignment |
| Fixed pricing and custom quotations by service | Explicit purchase mode, different forms/commands, shared agreement integrity |
| Vendor maintains availability and accepts each request | No automatic confirmation from a displayed date or fixed package price |
| Vendor acceptance confirms; no deposit required | Commit agreed booking and capacity on vendor acceptance; payment is a separate obligation |
| Payment schedule comes from disclosed vendor terms | Capture/version schedule before commitment; flag terms contradicting acceptance-based confirmation |
| Customer chooses direct-vendor or through-Ocasio payment | Complete receipt/refund handling for direct route; approved provider execution for platform route |
| Keep confirmed components if another supplier declines | Replacement affects its component; preserve other commitments |
| Vendor commission plus one-time/recurring vendor charges after approval | Separate approval, fee agreement, activation, invoice, recurring billing and commission records |
| Customer onboarding free; optional assistance paid | No onboarding paywall or preselected premium assistance |
| Assistance includes sourcing, booking, follow-ups, coordination, event-day help | Actual staff work assignment, progress and approval trail; physical attendance confirmed separately subject to availability |
| Standard Ocasio cancellation policy | Central versioned rules with approved category exceptions; never import arbitrary industry percentages |
| Production quality, CSRF and applicable legal/privacy duties | Evidence, tests, operational recovery and legal approval as appropriate; no claim of implementation from documents alone |

## 2. Delivery model

Build complete vertical slices: usable interface → server validation/permissions → durable data → truthful state → notification/integration → operator recovery → acceptance evidence. A phase's demo must exercise actual persisted records across the roles involved. Synthetic data belongs only in clearly labelled non-production contexts.

The final vision spans all approved customer, vendor and staff capabilities. Unconfirmed optional capabilities (for example family collaboration, AI, a particular messaging channel or vendor team model) receive a decision gate; they are not silently added or dropped. If approved, their work packages become required before the relevant release.

Each phase has an entry gate, work packages, exit evidence and unresolved dependencies. Mark work `planned`, `ready`, `in_progress`, `verification`, `accepted`, or `blocked_on_decision/external_dependency`. Do not mark a phase complete on visual polish alone. Status here is a documentation convention, not an app automation.

No calendar promise is made without agreed founder hours, delivery team capacity, approved scope and provider/legal lead times. After Phases 0–1, estimate bounded work packages with assumptions, uncertainty and external lead times. Do not turn phase numbers into weeks.

## Phase 0 · Product, policy and architecture readiness

**Outcome:** remove ambiguity that would otherwise force developers to invent business rules.

**Entry:** this plan and confirmed concept available.

**Work:**

- Consolidate the current decision register and archive superseded statements as history. Approve launch occasions/categories, exact locality coverage, supplier/team ownership and required profiles.
- Define package ownership, component compatibility, replacement repricing, post-confirmation changes and independent contract boundaries.
- Define fixed/custom service mapping and the exact offer/request/acceptance handshake. If the supplier revises price or scope, obtain explicit customer agreement before treating it as the requested service; legal review determines contract formation evidence.
- Define supplier admission, actual check labels, eligibility expiry, suspension and appeals; commercial fee payment is not a quality check.
- Approve commission basis/trigger, one-time versus recurring plans, amounts, interval, cancellation/proration, payment due schedules, overdue actions, refund authority and free-versus-premium support boundary.
- Prepare standard cancellation/no-show/reschedule/deficiency rules with counsel, plus assistance scope/authority, entity/seller disclosures, provider funds flow and CA tax/invoice assessment.
- Choose identity methods, role/scope matrix, guest handling, communication channel, privacy/media/children rules, retention, languages and accessibility target.
- Decide deployment ownership, region, budget/load assumptions, monitoring/recovery objectives and acceptable supporting tools. Run limited technical proofs for database transactions/ORM, identity/session topology and provider feasibility.
- Record architecture decisions for modular backend, contract format, database tooling, jobs, storage and observability. Verify supported versions/security advisories at kickoff; pin selected versions only then.

**Exit:** approved decision cards identify rule, examples, approver, date and affected work. Foundations/design may proceed where independent. Booking, collection, public policy claims and paid-service activation cannot bypass their unresolved gates. No forced blanket approval of every proposed page.

**Evidence:** decision register, permission matrix, policy hierarchy, entity/money-flow diagram, external onboarding register, sample fixed/custom/multi-vendor agreements, architecture decision records.

## Phase 1 · Brand foundation, information architecture and UX

**Outcome:** a coherent brand and designed experience for the mature product.

**Depends on:** core model and enough taxonomy/coverage decisions from Phase 0; policy-sensitive screens remain gated.

**Work:**

- Create factual founder story, positioning, customer/vendor value propositions, voice, service promise and proof requirements. Perform naming/trademark/domain review through appropriate processes; availability is not assumed.
- Develop and approve visual direction: logo system, colour/type, imagery, iconography, layout, motion and accessibility tokens. Deliver reusable brand assets and usage guidance. No invented clients, reviews or traction.
- Approve navigation and page families P01–P50; design actual public/customer/vendor/staff flows, including empty, error, pending, expired and conflict states.
- Prototype idea-to-brief, service-to-request, quote comparison, vendor acceptance, package replacement, payment choice, assistance, cancellation and grievance journeys.
- Specify responsive behaviours, keyboard/focus, plain-language status vocabulary, scope-aware prices and evidence labels. Test with realistic long names, missing prices, zero reviews, rich quotes and variable media.
- Validate prototypes with representative customers/vendors/operators; record failures and revisions. This is a planned exercise, not research already completed.

**Exit:** approved design system/brand kit, sitemap, interaction specs and critical-journey prototypes. Every major CTA has a defined real destination and underlying operation. No production public UI is treated as validated from a static mockup alone.

## Phase 2 · Fresh engineering and operational foundation

**Outcome:** deployable Next.js/NestJS/PostgreSQL foundation, isolated from legacy assumptions.

**Depends on:** chosen tooling/hosting/session direction; design foundations can evolve concurrently.

**Work:**

- Create new build structure in an agreed location. Proposed separation: web, API, worker and shared contracts/design packages. Do not overwrite, migrate or reuse the historical app implicitly.
- Configure formatting/type/lint checks, scripts, environment validation, local services, isolated staging/production, secrets and test data strategy.
- Establish migrations, relational identifiers, version conventions, currency/minor-unit rules, UTC/event-timezone handling and transaction helpers.
- Define OpenAPI contracts, generated client integration where chosen, runtime validation, safe errors, request correlation, pagination and idempotency conventions.
- Implement audit capture, transactional outbox, retry/dead-letter worker, health/readiness checks, structured redacted logs, metrics/traces, backup and restore tooling.
- Establish CI, dependency/security checks, database integration harness, browser test harness and deployment/migration/rollback procedures.

**Exit:** clean setup → migration → deployed staging → synthetic protected/read/write slice → worker notification stub/approved test provider → traceable failure/retry. Restore sample backup. Document real recovery limitations. External production credentials are not required for this internal foundation demo.

## Phase 3 · Identity, permissions, privacy and security core

**Outcome:** secure access shared by all later slices.

**Depends on:** Phase 2 and identity/organisation decisions.

**Work:**

- Implement selected sign-in, verification, recovery, session expiry/revocation and safe return paths; customer onboarding remains free.
- Implement actor/resource/field permissions, vendor organisation membership and staff scopes as approved; prohibit self-granted roles/verification.
- Implement session-appropriate CSRF defences on authoritative NestJS mutations, secure cookies/origin controls, abuse limits and safe secret handling. Document provider webhook authentication separately.
- Add privacy notice/version records, optional marketing choices, data access inventory and audit rules; personal-data requests need identity-safe case processing.
- Build private/public media separation with scoped upload/download, validation/quarantine, safe processing, provenance and publication permissions.
- Add account/settings/security screens P15/P29 and staff-access foundation P49. Create only approved team/collaborator features, with invite expiry/revocation tests.

**Exit:** direct API access cannot bypass roles; changed identifiers cannot expose another customer/vendor; cross-site mutations fail; valid requests succeed; revoked users lose access; private uploads stay private. Privacy/retention foundations have named owners. A04/A07/A20/A21 plus CSRF checks pass for this slice.

## Phase 4 · Vendor application, selection and commercial onboarding

**Outcome:** a real supplier can apply, be evaluated and progress through post-approval billing without a fake public listing.

**Depends on:** Phase 3; admission, fee and publication policies.

**Work:**

- Build P30–P35/P40/P42: partnership entry, draft application, evidence, corrections, reviewer assignment, decision, reasons and appeal where approved.
- Separate application approval, eligibility, profile publication, new-booking permission and billing state. Define activation after approved vendor fee terms without inventing its trigger.
- Build supplier profile/brand presentation, service areas, structured service modes, original portfolio, preview/publishing and scoped verification labels.
- Build one-time invoice and recurring plan acceptance records; connect sandbox/provider billing in Phase 10. No auto-debit from approval alone.
- Implement suspension/reinstatement/offboarding with preserved records and future-booking exception tasks.

**Exit:** supplier application → genuine staff decision → accepted post-approval commercial terms → eligible published profile. Required fee activation rules demonstrated when configured; failures visible to staff. Unapproved suppliers/evidence never publish accidentally. A06/A07/A20/A22 pass.

## Phase 5 · Content, coverage, discovery and vendor brand presence

**Outcome:** the public website connects genuine local possibilities to credible supplier brands.

**Depends on:** approved brand/UI, Phase 4 public catalogue and actual coverage.

**Work:**

- Implement P01–P14 and P46/P48 publishing: home, occasions, idea collections/details, locality coverage, service search, supplier profiles, service detail, comparison, trust, story, help and reviewed policies.
- Build content studio with rights/provenance, actual-work/concept distinctions, drafts, review, preview, publication, rollback and cache/search invalidation.
- Build structured filter/search/ranking and a public explanation; recommend only eligible suppliers. Treat sponsorship, if ever approved, as labelled placement rather than quality status.
- Show price units, inclusions/exclusions and fixed-versus-custom modes accurately. Available service listing is not automatic reservation.
- Implement technical SEO, metadata/canonicals/sitemaps, redirects, correct missing/withdrawn states, responsive media and accessibility. Do not index empty/thin locality permutations or private pages.
- Publish required platform/seller disclosures and real contact/grievance channels; route any enquiry form into a genuine receiving process.

**Exit:** staff publishes accurate content → searchable locality/service/idea → supplier evidence/detail → saved context or next real action. No invented reviews/availability/prices. A01–A03/A22/A23 pass. Website is not opened for live transactions merely because discovery works.

## Phase 6 · Occasion workspace, briefs, requests and communications

**Outcome:** customer intent reaches the right suppliers with traceable shared information.

**Depends on:** Phases 3–5; matching, guest and communication decisions.

**Work:**

- Build P16–P19/P23/P26 and P33/P37/P43 foundations: occasion creation, flexible/unknown dates, budget basis, service needs, references, venue constraints, drafts and shortlists.
- Carry inspiration/service selections into structured brief versions; validate category-specific required fields and preserve drafts through auth/errors.
- Show Ocasio recommendations and customer selection; implement only approved matching criteria and staff overrides with recorded reasons.
- Record recipient/data-sharing preview, distribute requests once, capture clarifications and close/withdraw requests consistently.
- Implement selected communication model with attachments, participant access, delivery failures/retries and notification preferences. If external channels are selected, retain explicit booking milestones and consent rather than inventing in-product chat.
- Implement collaboration only if approved; view/comment/approve/spend permissions must be distinct.

**Exit:** visitor/customer → saved brief → authorised supplier request → clarification → customer-visible tracking, staff recovery and honest delivery states. Duplicate submission cannot broadcast multiple requests. A04/A05/A20/A23 pass.

## Phase 7 · Fixed offers and custom quotations

**Outcome:** clear, versioned offers instead of vague chat-based commitments.

**Depends on:** Phase 6 and pricing/category/terms decisions.

**Work:**

- Build P09/P10/P20/P37: scoped fixed offers/options and custom quote editor; customer comparison/clarification; supplier revisions/withdrawals/expiry.
- Server derives line-item totals, currency/rounding and approved fees/taxes. Capture timing, site/travel constraints, scope, exclusions, supplier identity, payment schedule and standard cancellation policy version.
- Preserve issued versions; connect each offer to the brief version. Distinguish customer agreement to quoted scope from the supplier's final acceptance command.
- Enforce the approved handshake when terms change. An acceptance of a customer request cannot silently introduce extra price/scope/obligations.

**Exit:** fixed and custom offer paths each reach an agreed request version with explicit next actor; expired/superseded/stale versions fail safely. Edited catalogue does not rewrite an issued offer. A03/A08/A10 pass.

## Phase 8 · Capacity, vendor acceptance and confirmed bookings

**Outcome:** genuine reservation integrity and customer/vendor commitment without a deposit gate.

**Depends on:** Phase 7; approved resource model and confirmation/cancellation framework.

**Work:**

- Build P21/P24/P36/P38/P44: resource calendars/capacity, setup/service/teardown and travel buffers as applicable, final request review and vendor acceptance/decline.
- Implement vendor acceptance as the authoritative atomic operation: check eligibility, exact agreement, actor, resource availability and current state; commit capacity/confirmed booking and outbox events.
- Payment remains unpaid/not-due/due according to the disclosed schedule. It cannot block acceptance under the confirmed no-deposit rule.
- Record immutable accepted terms, status history, obligations and responsible contacts. Handle stale UI, concurrent acceptance, duplicate requests and vendor suspension.
- Record declined/expired requests and release only resources actually held; whether pre-acceptance holds exist depends on the approved policy.

**Exit:** two vendors/customer/staff views show the same confirmed booking after vendor acceptance with no payment. Concurrent requests cannot claim the last resource. A08–A10/A20 pass. Demonstrate the counter-case: fixed pricing does not instant-confirm a request.

## Phase 9 · Customisable multi-vendor packages

**Outcome:** a coherent package experience without hiding independent supplier commitments.

**Depends on:** reliable Phases 5–8 plus package ownership/compatibility decisions.

**Work:**

- Add package templates, per-component recommendations, customer-selected alternatives, scope compatibility and separate supplier offer/acceptance records.
- Show complete-versus-partial scope and totals clearly; preserve accepted component terms when another is unconfirmed.
- If one supplier declines, flag that component for replacement, re-evaluate its scope/price/availability and request replacement acceptance. Other confirmed components remain intact.
- Differentiate pre-confirmation configuration from amendments to an already confirmed supplier booking. Do not allow a harmless-looking vendor selector to cancel a contractual commitment.
- Aggregate package progress/actions without inventing all-or-nothing booking or payment status. Decide route/milestone granularity before monetary integration.

**Exit:** four-component example with three accepted and one declined retains the three; customer replaces the fourth, reviews differences and obtains its acceptance. Record failures, repricing and dependency warnings. A17 plus version/capacity tests pass.

## Phase 10 · Payments, vendor billing and finance operations

**Outcome:** both requested payment routes and all approved revenue streams work with honest accounting and recovery.

**Depends on:** Phases 4/8/9; written provider approval, commercial parameters, tax/invoice and funds-flow decisions. Start provider onboarding in Phase 0, not at this phase's arrival.

**Work:**

- Build P22/P39/P45 and booking payment views: schedules, due amounts, route selection, payment evidence, invoices/receipts and dispute handling.
- Direct-vendor route: share permitted recipient details, record receipts/claims, apply reviewed verification, reconcile disputes/refunds and collect Ocasio commission through the agreed method. A screenshot is not automatic settlement proof.
- Through-Ocasio route: provider-approved merchant/submerchant onboarding, server-created attempts, signature verification, duplicate/out-of-order events, reconciliation, provider refunds and actual settlement records as applicable.
- Separate provider creation uncertainty from failure. Booking is already confirmed on vendor acceptance: payment timeouts cannot silently undo it. Resolve overdue cancellation only through approved policy.
- Implement vendor commission calculation/receivables/adjustments, post-approval one-time billing and recurring plans. If autopay is selected, explicit mandate and notices; otherwise manual recurring invoices. Add failed renewal, grace, revocation, refunds and cancellation/proration rules after approval.
- Bill optional personalised assistance separately under its accepted scope. Keep collected service funds, vendor liabilities, platform revenue and tax distinct.
- Add financial access limits, approval/audit, exports, matching exceptions and reliable provider/bank credit status. Do not label quote totals revenue.

**Exit:** both routes verified, including unpaid confirmed booking, due-date payment, failed/unknown attempts, closed browser, duplicate callbacks, partial refund, provider mismatch and recurring renewal/revocation. Finance can investigate/recover each case. A11/A12/A15/A16 plus fee/mandate checks pass. A13 applies only if the final design creates expiring pre-confirmation payable states; no such state is assumed.

## Phase 11 · Personalised assistance and event operations

**Outcome:** paid assistance is a delivered service with explicit authority and staffing.

**Depends on:** Phases 6–10; assistance price/scope/hours/approval policies. Design staff operations earlier; do not postpone basic support until here.

**Work:**

- Build optional assistance selection, accepted scope/fee and customer workspace with assigned coordinator, tasks, sourcing/booking actions, follow-ups, vendor readiness and event-day schedule.
- Staff actions on behalf of customers use scoped delegation and explicit approval evidence; no account impersonation or unlimited spending.
- Build on-site assistance request → availability check → proposed assignment → explicit confirmation or unavailable outcome. Remote coordination purchase never implies physical attendance.
- Provide handover, backup ownership, issue escalation, customer/vendor dependencies and event-day contact information under privacy rules.
- Track delivered work and any extra scope through amendments. Implement cancellation/refund treatment only from approved assistance policy.

**Exit:** customer buys assistance intentionally → real operator assigned → documented tasks/approvals → event-day help; on-site unavailability stays truthful. Declining assistance never adds a hidden customer fee or blocks ordinary onboarding. Operator absence/failure has a tested escalation path.

## Phase 12 · Changes, cancellations, support, completion and reviews

**Outcome:** lifecycle failures and outcomes are as complete as booking creation.

**Depends on:** Phases 8–11 and approved policies. Core support intake/grievances must exist before earlier live use; this phase completes full lifecycle capability.

**Work:**

- Build P25/P27/P28/P40/P41/P44/P47: amendment/reschedule comparison and approval, standard cancellation assessment, supplier failure, replacement proposal, partial delivery and financial execution links.
- Preserve original agreement until amendment acceptance; distinguish cancellation from refund; keep unaffected package bookings.
- Implement real grievance officer intake, tracking, complaint copies, legal clocks and escalation. Distinguish consumer, privacy, content and security cases using reviewed applicability rather than one universal timer.
- Finalise fulfilment evidence and completion disagreement rules, then review eligibility, publication, vendor response, moderation/privacy redaction and appeals.
- Capture supplier quality and recurring failures without deleting negative customer evidence; assess suspension against upcoming commitments.

**Exit:** complete successful event and dispute scenarios across customer/vendor/staff; no false case closure while remedy fails. A14–A19 pass; grievance-clock and complaint-copy checks pass; staff can resolve incomplete/failed actions without unaudited database edits.

## Phase 13 · Integrated reporting, privacy, compliance and production hardening

**Outcome:** the whole system is measurable, recoverable and ready for release assessment.

**Depends on:** all enabled journey slices; compliance/security work has run continuously since Phase 0.

**Work:**

- Complete P29/P49/P50: rights/data-request processing, retention/legal holds, processor actions, access reviews, audit exports and reporting definitions.
- Reconcile current and future legal requirements; review published terms, disclosure completeness, recurring billing, media/children handling, sender setup and category/local permissions. Complete applicable audit evidence rather than claiming a badge.
- Build funnel/quality/finance/assistance dashboards from real events. Distinguish occasion, supplier booking, accepted value, collected money, earned fee and outstanding liability.
- Test full journeys across roles, browsers, mobile and slow connections. Perform security review including CSRF, broken object-level access, XSS/injection, uploads, abuse, webhooks and secret leakage.
- Measure agreed performance/load budgets against declared workload; perform accessibility review, SEO/indexing checks, backup restore, failed migration/rollback and incident-reporting drills.
- Verify queue outage, repeated worker processing, delayed provider events, notification failure and deploy-while-bookings-active recovery. Validate alerts with actual recipients.

**Exit:** A01–A24 and relevant extensions pass for enabled scope; L01–L30 have current evidence/applicability dispositions and authorised unresolved-risk treatment. Critical security, money-integrity and statutory blockers are resolved before release. No assertion that tests or counsel have already approved the product.

## Phase 14 · Production activation, monitored rollout and ongoing operation

**Outcome:** an operating brand, not merely deployed code.

**Depends on:** documented release approval and Phase 13 evidence; public publishing/transaction activation remains a separate explicit action.

**Work:**

- Configure verified domain, TLS, secrets, provider production onboarding, live webhook/scheduler routes, sender identities, observability, backup and support contacts.
- Seed/import only authorised real suppliers/content; validate consent/licences and supplier acceptance of current terms. Never migrate old demo ratings/test payments as history.
- Rehearse low-value controlled end-to-end live transactions only under explicit test authorisation and normal finance controls; reconcile with provider records.
- Open approved localities/categories and capacity deliberately, with named support/finance/technical owners. A monitored rollout limits operational exposure without substituting a fake product for the intended vision.
- Prepare customer/vendor launch communications and actual escalation coverage. Send/publish only with explicit authorisation.
- Monitor payment exceptions, acceptance conflicts, failed jobs, support load and supplier delivery; suspend new commitments in an affected area safely when needed while preserving existing bookings.
- Establish recurring operational processes: source/legal recheck, access review, dependency updates, backup restore, incident rehearsal, vendor evidence renewal, content freshness, cancellation/quality review and fee reconciliation. Scheduling automations is not authorised merely by this plan.

**Exit:** rollout checklist signed by designated owners; real operational evidence captured; unresolved exceptions assigned. Completion of launch begins continuing maintenance—it does not promise a fixed end to operations.

## 3. Dependencies and parallel work

Critical transaction path: 0 → 2 → 3 → 4 → 6 → 7 → 8 → 9 → 10 → 12 → 13 → 14. Brand/UX Phase 1 and public experience Phase 5 converge into these slices. Assistance Phase 11 depends on the booking/finance foundations. Real supplier content and provider/legal onboarding start early and may dominate elapsed time.

After shared contracts are approved, suggested workstreams are experience/content, domain/API/data, and integrations/quality/operations. These are responsibilities, not an assumed allocation of one founder to each. Use joint review for cross-domain boundaries. Agents can help research/implementation/review when authorised but do not replace product decisions or accountable production owners.

Phase independence does not justify separate incompatible price/permission/state logic. Shared contracts, fixtures, migrations and integration checks gate parallel merges. Do not let frontend/backend teams each invent confirmation rules.

## 4. Global definition of complete

Approved scope/rules; designed responsive/accessibility states; authoritative permissions/validation; durable/versioned data; concurrency/idempotency where relevant; correct external integration; truthful notifications; staff recovery; audit and safe analytics; relevant tests; deployment/migration/rollback; monitoring/runbook/owner; legal/content approval as applicable. Evidence and remaining risks accompany each accepted work package.

## 5. First implementation session after plan approval

Review Phase 0 gate cards and the full phase map. Confirm new code location/tool choices and ready requirements. Create the fresh build and foundation backlog only when implementation is requested. Do not rewrite the old application or begin a visual-only homepage as a substitute for this plan.
