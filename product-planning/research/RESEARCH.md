# Research evidence and remaining investigations

Checked 20 November 2026. Research was divided into customer experience, vendor/staff operations and production engineering, then synthesised into the blueprint. The historical repository was excluded from this design and research. This is public desk research, not customer validation, a legal opinion, provider onboarding approval or a production audit.

## 1. How evidence is used

**23 November legal extension:** [India launch legal research](INDIA-LAUNCH-LEGAL-RESEARCH.md) covers consumer/e-commerce amendments, DPDP commencement, cancellation, security, payments, recurring billing and tax/category review. [Implementation controls](../07-LEGAL-IMPLEMENTATION-AND-LAUNCH-GATES.md) track proposed work and professional sign-off gaps. The earlier research date applies to the original product-pattern study, not this later legal extension.

Official product pages establish what a company describes, not whether its users are satisfied or its economics work. Technical documentation establishes supported mechanisms and documented failure concerns, not that a particular deployment is secure or reliable. Ocasio design implications below are inferences/proposals. They remain subject to founder review and must not be relabelled confirmed requirements.

No competitor conversion, margin, market-share, supplier quality or city-level demand figures are asserted. No sales outreach, customer contact, account signup or paid mystery booking was performed. No external messages were sent.

## 2. Product-pattern evidence

| Source | Observed public pattern | Proposed Ocasio implication / limit |
|---|---|---|
| R01 [Bark help: how it works](https://help.bark.com/hc/en-us/articles/13342669635484-What-is-Bark-and-how-does-it-work) | Structured customer requirements are matched with professionals; professionals select paid introductions | Requirements and matching can be first-class workflows. Ocasio lead charging is not decided |
| R02 [Thumbtack customer journey](https://www.thumbtack.com/how-it-works) | Search local profiles/reviews, discuss needs and hire | Connect discovery with clarification and a recorded commitment rather than an isolated contact CTA |
| R03 [CherishX NCR catalogue](https://cherishx.com/experiences/delhi-ncr/birthday-decorations-at-home) | Scoped celebration options lead through selection, date/time, address and payment | Fixed packages are a distinct purchase mode; this does not establish Ocasio inventory or pricing |
| R04 [CherishX partnership programme](https://cherishx.com/partner-with-us) | Partner roles include decorators delivering designs, hospitality and activity providers | Assigned fulfilment and customer-selected supplier models must be distinguished |
| R05 [The Bash help centre](https://www.thebash.com/help) | Documents supplier search, enquiries, communication and booking-related guidance | Model enquiries and offers explicitly; source used as workflow reference, not evidence of Ocasio customer demand |
| R06 [Peerspace finding a space](https://support.peerspace.com/en/articles/10119108-how-do-i-find-the-right-space-for-my-booking) | Booking capabilities vary by listing | Distinguish request availability, quote request and genuine instant confirmation |
| R07 [Peerspace custom offers](https://support.peerspace.com/en/articles/11642753-how-to-send-a-custom-offer-using-the-invite-to-book-feature) | Custom offers include booking context and commercial detail | Quotes need structured scope and versions; do not copy its specific validity period |
| R08 [Peerspace booking updates](https://support.peerspace.com/en/articles/10119465-how-can-i-update-my-booking) | Changes require counterparty agreement; unsuccessful changes preserve existing booking | Use amendments, not silent overwrites of accepted scope |
| R09 [Peerspace cancellation](https://support.peerspace.com/en/articles/10119476-how-do-i-cancel-a-booking) | Cancellation has a formal action separate from ordinary discussion | Explicit cancellation record/effective time is needed; Ocasio fees/time windows remain undecided |
| R10 [Peerspace booking issues](https://support.peerspace.com/en/articles/10119485-what-do-i-do-if-there-is-an-issue-resulting-from-a-booking) | Issue resolution can require statements and evidence | Support needs cases, ownership and executable remedies; do not inherit foreign dispute policy |
| R11 [Thumbtack safety guidance](https://www.thumbtack.com/safetyguidelines/) | Describes limits to what checks establish about account owners versus workers | Store who/what was checked, scope and recency; do not claim all workers are verified |
| R12 [Airbnb wishlists](https://www.airbnb.com/help/article/1236) | Sharing/collaboration has different access modes | Optional family collaboration requires explicit permissions and revocation |

## 3. Technical evidence

| Source | Documented mechanism/concern | Proposed architecture implication |
|---|---|---|
| R13 [Next.js server/client components](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Server rendering and selective interactive components | Server-render public content, keep interactive boundaries deliberate; business authority stays in NestJS |
| R14 [NestJS OpenAPI](https://docs.nestjs.com/openapi/introduction) | API description integration | Evaluate generated contracts/client types and compatibility checks |
| R15 [NestJS queues](https://docs.nestjs.com/techniques/queues) | Background job integration | Candidate retryable worker tooling; not proof Redis/BullMQ is required |
| R16 [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) | Row locks, conflicts and deadlocks | Design/test atomic resource commitment and lock order; no external call while holding long locks |
| R17 [PostgreSQL serialization failure handling](https://www.postgresql.org/docs/current/mvcc-serialization-failure-handling.html) | Retrying a transaction requires reconsidering its complete logic | Bound retries around the whole decision rather than only the last write |
| R18 [Stripe webhook documentation](https://docs.stripe.com/webhooks) | Duplicate and out-of-order event concerns | Deduplication, ordering resilience and reconciliation. Stripe is not selected or established eligible for Ocasio |
| R19 [Razorpay Route](https://razorpay.com/docs/payments/route) | Marketplace transfer capability and eligibility/onboarding conditions | Commercial feasibility must be checked before selecting platform collections; no automatic Route commitment |
| R20 [OWASP authorisation](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) | Least privilege/default denial and permission checks | Enforce object/field/scope checks on every operation |
| R21 [OWASP logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) | Security logging and sensitive-data handling | Restricted operational evidence with redaction, retention and audit access |
| R22 [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics) | Rendering and crawlable content considerations | Meaningful public HTML and controlled indexable URLs; private access remains server-enforced |
| R23 [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Accessibility success criteria and conformance levels | Propose AA target with manual and automated checks; no conformance claim before verification |
| R24 [Core Web Vitals](https://web.dev/articles/vitals) | LCP/INP/CLS field measurements and good thresholds | Propose measurable performance objectives; lab results alone do not establish field experience |
| R25 [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/) | Logs, metrics and traces as observability signals | Correlate requests/jobs/provider references while minimising personal data |

Provider documentation and framework releases change. Recheck chosen integration details and eligibility at implementation/procurement. Technical capability is not a legal conclusion or permission to process money/customer data.

## 4. Alternatives evaluated conceptually

**Bespoke quotes versus fixed packages:** neither is chosen globally. Quotes support variable requirements; packages reduce ambiguity only when scope/options and availability are reliable. Hybrid-by-category adds operational complexity and needs explicit capability rules.

**Direct vendor payment versus platform collection:** direct payment needs receipt verification and receivables tracking; collection needs provider eligibility, financial controls and reconciliation. Neither removes support obligations. Resolve money flow before building checkout.

**Modular backend versus microservices:** propose one modular NestJS backend plus workers because transaction boundaries and coherent domain rules matter now. Independent services remain an option when measured constraints justify them. This is an engineering recommendation, not a statement about future scale.

**SQL versus another database:** propose PostgreSQL for relational consistency, versioned agreements and transactional resource constraints. Document store/search/cache may supplement it if needed; they should not accidentally become separate authorities for bookings or money.

**Own messaging versus external channels:** in-product threads improve contextual records but add moderation, attachment and delivery work. External channels need consent, milestone recording and a rule for agreements made outside the product. Channel choice remains open.

## 5. Research still required before implementation decisions

| Investigation | Evidence to obtain | Decision affected | Exit criterion |
|---|---|---|---|
| Founder operating model | Approved choice of selection/assignment, scope and responsibility | D01–D04 | Written role and transaction boundary with examples |
| Customer discovery | Interviews across intended locations with recent real occasion purchases; include non-friends | D02, D14, D15, D19 | Document needs and contrary evidence without claiming statistical representativeness |
| Vendor workflow validation | Sample actual quotes, resource calendars, team structures and cancellation constraints | D02, D07–D11, D17 | Category-specific quote/capacity fields validated with suppliers |
| Commercial validation | Vendor/customer willingness to pay and collection evidence | D05 | Founder-approved fee model, basis and collection process |
| Payments/professional review | Provider product eligibility, settlement/refund capability, entity/invoicing/tax responsibilities | D06, D08, D24, D28 | Feasible written payment flow and accountable approvals |
| Support-policy design | Real founder/staff availability and remedy funding/authority | D04, D09, D10, D13 | Publishable support rules with operational owner |
| Privacy/data mapping | Required fields, disclosures, processors, retention and professional assessment | D16, D18, D23, D28 | Approved data inventory and access/retention rules |
| UX validation | Moderated tasks: uncertain idea → brief; compare scope; understand confirmation; request change | P01–P29 | Findings, fixes and remaining risks recorded; no invented usability score |
| Technology proof | Transaction/lock prototype, chosen ORM evaluation, provider sandbox and deployment recovery | D25, D26 | Demonstrated critical invariants, measured cost and documented tradeoffs |
| Brand inputs | Founder names/story, voice, identity preferences, rights and claim substantiation | D21 | Approved factual story and separate brand-design brief |

No interviews, prototypes, legal review, load tests or sandbox financial tests in this table are claimed completed. They are explicit future evidence requirements. Existing desk research can inform proposals while these remain open.

## 6. Research-to-requirement trace

- R01–R10 inform P04–P10, P17–P27 and W01/W03/W06.
- R04/R11 inform P30–P38, P42 and W02.
- R12 informs conditional collaboration in P16/P18/P23/P29.
- R13–R17 inform architecture and A08–A10/A14.
- R18/R19 inform conditional finance and A11–A16.
- R20/R21 inform access, evidence and A06/A07/A20/A21.
- R22–R25 inform public visibility, accessibility, performance and production operations.

Research does not approve a page, provider, policy or launch claim. Approval is recorded through the decision register.
