# Execution backlog, coverage and decision gates

Companion to [the phased plan](08-PHASED-IMPLEMENTATION-PLAN.md). All work is **planned**, not implemented. Work-package IDs below are intended to become reviewable tickets after their decisions are ready. Do not create estimates or assign actual founders without agreement.

## Work packages

| Phase | Work-package IDs and deliverables | Demonstration |
|---|---|---|
| 0 | F00 decisions/authority; F01 policy and contract examples; F02 provider/entity/tax assessment; F03 architecture/tool proofs; F04 scope/coverage and workload | Approved rules with concrete fixed/custom/package examples |
| 1 | B01 story/positioning; B02 visual identity/brand kit; B03 sitemap/navigation; B04 responsive design system; B05 journey prototypes/validation | Customer/vendor/staff prototype with real edge states |
| 2 | E01 fresh project; E02 environments/migrations; E03 API contracts/errors; E04 audit/outbox/worker; E05 CI/tests/deploy; E06 monitoring/restore | Persisted staging slice, failed job retry and restored data |
| 3 | I01 identity/recovery; I02 scoped permissions; I03 session/CSRF/abuse; I04 private media; I05 privacy/account settings; I06 invitations if approved | Authorised mutation succeeds; cross-site/cross-account attempts fail |
| 4 | V01 application/evidence; V02 review/corrections; V03 approval/restriction; V04 profile/services/portfolio; V05 commercial agreement/activation separation | Apply → review → accepted fee terms → eligible publication |
| 5 | D01 public brand/occasion/idea pages; D02 coverage; D03 search/recommendations; D04 vendor/service/compare; D05 CMS/media rights; D06 help/policies/SEO | Publish → find → understand → choose; withdraw updates search/cache |
| 6 | C01 occasion/brief; C02 saved context; C03 recipient sharing/request; C04 matching desk; C05 communication/delivery; C06 collaboration if approved | Saved idea → brief → supplier request/clarification once |
| 7 | Q01 fixed offer schema/options; Q02 custom quote/version; Q03 scope comparison; Q04 terms assent/revision | Immutable version, clear next actor and rejected stale offer |
| 8 | K01 availability/resources; K02 vendor acceptance command; K03 booking agreement/history; K04 decline/expiry/recovery | Accept → confirmed plus capacity, unpaid, without deposit |
| 9 | M01 package components; M02 vendor alternatives; M03 compatibility/reprice; M04 partial status/replacement | Three confirmed components survive fourth-vendor replacement |
| 10 | P01 schedules/route choice; P02 direct receipts/verification; P03 provider attempts/webhooks; P04 reconciliation/refunds/settlement; P05 commission; P06 one-time vendor fees; P07 recurring plans/mandates; P08 assistance billing; P09 invoices/finance permissions | Both routes plus duplicate/late events, renewal and disputed receipt |
| 11 | S01 assistance offer/scope; S02 coordinator tasks/delegation; S03 approvals; S04 on-site availability/assignment; S05 handover/event-day coverage | Paid scope → named operator → approved work → honest attendance state |
| 12 | R01 amendments/reschedule; R02 cancellations; R03 grievance/cases; R04 remedies/financial links; R05 completion disputes; R06 reviews/moderation/quality | Successful fulfilment and failed supplier/refund across all roles |
| 13 | H01 analytics/reporting; H02 rights/retention; H03 compliance evidence; H04 security/accessibility/performance; H05 restore/incident/deployment rehearsal; H06 full regression | Evidence pack with unresolved-risk decisions and recovery demo |
| 14 | G01 production configuration; G02 authorised supplier/content loading; G03 controlled live verification; G04 monitored activation; G05 operational ownership/maintenance | Approved release with monitored real operations |

## Coverage of every proposed page family

| Existing IDs | Covered experience | Primary phase; completion dependencies |
|---|---|---|
| P01–P06 | Home, occasions, inspiration and locality coverage | 5; brand/content approval 1/0 |
| P07–P10 | Service search, vendor brand/profile, service detail and comparison | 5; live offers/quote comparison 7 |
| P11–P14 | Trust, founder story, help/contact and policies | 5; legal/publication gates 0/13; real receiving support 6/12 |
| P15 | Identity/recovery | 3; contextual resume 6 |
| P16–P19 | Occasions, briefs, saved context and requests | 6; collaboration only if approved |
| P20 | Quote detail | 7 |
| P21 | Commitment review | 8; finance view 10 |
| P22 | Payment outcome | 10 |
| P23 | Occasion detail | 6; component confirmations 9; finance/assistance 10/11 |
| P24 | Booking detail | 8; lifecycle/finance 10/12 |
| P25 | Changes/reschedule/cancellation | 12 |
| P26 | Communication/notifications | 6; role/lifecycle integration through 12 |
| P27–P28 | Issues, completion and review | 12 |
| P29 | Account/privacy/security | 3; rights/retention completion 13 |
| P30–P35 | Vendor partnership, application, overview, profile/services/portfolio | 4; actual booking/finance metrics 8/10 |
| P36–P38 | Availability, enquiries/quotes and delivery operations | 6–8; event lifecycle 12 |
| P39 | Vendor finance | 10 |
| P40–P45 | Vendor quality and staff operations/admission/matching/bookings/finance | 4/6/8/10/12; fully integrated 13 |
| P46 | Editorial content studio | 5 |
| P47 | Trust/review moderation | 12 |
| P48 | Coverage/taxonomy configuration | 4/5; version rules 7/12 |
| P49 | Access/audit/privacy cases | 3; sensitive finance 10; rights completion 13 |
| P50 | Reporting/system health | Infrastructure 2; integrated reporting 13 |

### Additional page families now required by clarified decisions

These augment the original P01–P50 proposal; exact routes/layout remain design decisions.

| ID | Contents/operations | Phase |
|---|---|---|
| P51 Customer package configurator | Component scope/vendor, recommended alternatives, compatibility, price differences, partial confirmation and replacement | 9 |
| P52 Customer assistance offer/workspace | Scope, premium, acceptance/payment, operator, tasks/approvals, event-day contact, on-site request/status, changes/support | 11; billing 10 |
| P53 Assistance staff desk | Operator availability, workload, assignment, handover, delegated authority, customer approvals and event-day exceptions | 11 |
| P54 Vendor plans/billing | Approved-vendor fee schedule, one-time/recurring items, invoices, renewal, optional mandate, cancellation and failed collection | 4 agreement; 10 execution |
| P55 Legal/privacy/grievance operations | Policy publication/versions, complaint copy/clock, data requests, retention holds, evidence and reporting ownership | 3/5/12/13 |

## Decision-to-phase blockers

| Decision group | Must settle before affected implementation | Independent work that can continue |
|---|---|---|
| D01/D02 package ownership and category modes | 7/9 contracts, component schema and acceptance | Design discovery and prototype options |
| D03/D20 recommendations | 5 ranking and 6 matching distribution | Supplier profile/content work |
| D04/D13 assistance/support limits | 11 service activation, 12 remedies | Task infrastructure, basic case intake |
| D05/D08 vendor fees/schedules | 4 activation, 10 billing and overdue handling | Admission/evidence and finance adapter skeleton |
| D06/D28 funds flow/tax/provider | 10 platform collection, invoices and settlements | Direct-route design, identity/provider onboarding research |
| D07 capacity/expiry details | 8 resource reservation and request expiry | Agreed no-deposit acceptance contract and UI design |
| D09/D10/D12 cancellation/completion/reviews | 12 executable calculations/eligibility | Version registry, case data and UI prototypes |
| D11/D14/D15 admission/category/locality | 4/5 publishing/eligibility | Generic application and coverage data structure |
| D16/D17/D19 identity/organisation/collaboration | 3 tenancy/invitations, 6 sharing | Independent content/brand design |
| D18 channels | 6 messaging/delivery | Outbox/event contracts |
| D21/D22 content/language/accessibility | 1 final design/content architecture and 5 publishing | Factual story collection and design alternatives |
| D23/D24 privacy/staff authority | 3 sensitive access, 10 finance, 13 retention | Data inventory and permission prototypes |
| D25/D26 operations/tooling | 2 deployments and production sizing | Scoped technical proofs |
| D27 advanced optional scope | Before adding optional feature work | Full confirmed core continues |

No unresolved business-policy gate is resolved by picking a developer default. The point is to identify the smallest affected boundary and continue unrelated authorised work.

## Three-founder coordination proposal

Appoint a decision owner, implementation owner and reviewer per package; one person may hold more than one role. Avoid one permanent frontend owner and one permanent backend owner working without shared journey responsibility. For money, accepted agreements, privacy and CSRF, require explicit cross-boundary review. Actual allocation depends on founder availability and skills.

At phase review show: working journey, automated/manual evidence, source/decision changes, remaining defects, operational readiness and next dependencies. Keep a concise decision log. A new rule change must identify migrations, existing agreements and tests affected.

## Priority risks and mitigations

- Provider/legal approvals may outlast coding: start in Phase 0, do not replace approved collection with informal holding of funds.
- No-deposit confirmation creates unpaid commitments: approve due/overdue/cancellation rules, never silently require a deposit.
- Fee non-payment may affect vendors with active events: preserve commitments and route restriction/handover through staff.
- Supplier availability can be stale or omit external jobs: define update/staleness review, buffers and acceptance-time checks; calendar integration is not assumed mandatory.
- Payment route changes can double-collect: version route selection, detect verified/pending attempts, reconcile before switching.
- Packages can contain shared discounts/site dependencies: explicit repricing/compatibility approval; never cascade-cancel accepted components automatically.
- Assistance has separate human capacity: atomically reserve on-site slots where appropriate and provide operator absence/handover flows.
- Legal effective dates change launch obligations: recheck official instruments before activation; dated research is not permanent clearance.
- Historical sample data may look real: fresh schema and approved production content, no implicit legacy migration.

## Required integrated demonstrations before launch

1. Fixed service → customer request → vendor accepts exact terms → unpaid confirmed booking → payment per schedule → completion → review.
2. Inspiration → custom brief → quote revision → customer assent → vendor acceptance, with stale-version rejection.
3. Four-vendor package → three accept → fourth declines → replacement selection/reprice/acceptance; other commitments survive retries.
4. Direct receipt claim plus platform event attempt on same obligation → no double settlement; approved route-change recovery.
5. Supplier approval retry → one commercial obligation; two renewal workers → one recurring invoice; failed renewal preserves customer bookings.
6. Optional paid assistance → operator assignment → customer-approved action → on-site unavailable/confirmed paths; concurrent final on-site slot cannot confirm twice.
7. Vendor no-show/partial service → complaint clock → agreed remedy → refund execution failure/recovery → accurate review eligibility.
8. Cross-account and cross-site mutation denial; media privacy; retention/legal hold; worker/provider outage; restore and incident drill.

Acceptance records identify environment, version, test actor/fixture, expected/actual result, evidence, reviewer and unresolved risks. This plan itself is not that evidence.
