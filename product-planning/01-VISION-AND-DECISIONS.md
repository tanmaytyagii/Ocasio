# 01 · Confirmed vision and decision register

## Confirmed foundation

| ID | Founder statement |
|---|---|
| C01 | Ocasio is the idea and shared ambition of three co-founders, all developers. |
| C02 | Customers organise events infrequently and may lack contacts, awareness of trends and understanding of available possibilities. |
| C03 | Ocasio should help make their occasions worthwhile and deliver a strong experience. |
| C04 | Actual event services are vendor-delivered. Optional paid Ocasio assistance covers sourcing, booking, follow-ups, coordination and event-day assistance; on-site help is subject to availability. |
| C05 | Local vendor relationships will be developed city by city, with selection criteria, admission and quality assurance. |
| C06 | Customer reviews of vendors are part of the intended trust model. Eligibility and moderation policy are not yet defined. |
| C07 | Delhi NCR, Karnal and Muzaffarnagar are intended markets, supported by hometown and work/study connections. Exact service coverage is not confirmed. |
| C08 | The website should demonstrate the brand's full potential and feel like a complete production product. |
| C09 | Each selected feature needs end-to-end implementation; decorative or disconnected functionality is insufficient. |
| C10 | The old repository must not define the new concept, pages, scope, structure or architecture. |
| C11 | Use Next.js for frontend and NestJS for backend. If using SQL, use PostgreSQL. Additional technologies are permitted when justified. |
| C12 | Research carefully; separate agents may help. Do not rush, invent facts or silently decide unconfirmed matters. Hold questions until the founder requests the discussion. |
| C13 | Individual services and multi-vendor combined offerings are supported. Customers can replace recommended vendors; confirmed components stay booked when another declines. |
| C14 | Customers choose vendors from Ocasio recommendations. Vendor brand presence and reach to end customers are central to the proposition. Ranking rules remain open. |
| C15 | Both fixed pricing and personalised quotes are supported depending on the service. Which services use which mode remains open. |
| C16 | Revenue includes vendor commission, one-time and recurring vendor charges payable after approval, and optional paid personalised customer assistance. Customer onboarding is free. Amounts and detailed billing rules remain open. |
| C17 | Customer chooses direct-vendor or through-Ocasio payment. Execution/provider feasibility remains open; service payment schedules follow vendor terms shown to customers. |
| C18 | Vendors maintain available services and reconfirm each customer request. Vendor acceptance confirms without a deposit. Subsequent service payment follows disclosed vendor terms; reservation timing before acceptance remains open. |

## Historical clarification · 20 November 2026 (later decisions supersede where noted)

This clarification supersedes incompatible earlier alternatives and historical notes below:

- **C19 / D04:** Optional personalised assistance is paid. Ocasio arranges things on the customer's behalf to save time. Scope, price, duration, basic versus premium support, on-site involvement and spending/approval authority remain open.
- **C20 / D01:** Packages can contain multiple vendors. Ocasio recommends the vendors; customers can replace individual vendors. Package ownership, compatibility/repricing, partial confirmation/cancellation and post-confirmation replacement remain open.
- **C21 / D06:** Customer chooses direct-vendor or through-Ocasio payment. Provider feasibility, route execution, receipts, settlement, refunds and multi-vendor route granularity remain open.
- **C22 / D07:** Vendor defines confirmation requirements and reconfirms each request. Allowed settings, disclosure, deposit/balance rules, hold/expiry timing and package-level confirmation remain open.
- **D05 amendment:** Revenue now includes vendor commission, fixed onboarding charge and optional customer premium for personalised assistance. This explicitly supersedes the earlier vendor-only revenue statement for the assistance service; no general customer booking fee is approved.

These directions are confirmed; their unresolved details are not implementation defaults. Preserve accepted commercial terms rather than allowing later settings to rewrite existing commitments.

## Historical decision notes
### Booking and onboarding clarification · 20 November 2026 · latest authority

- **D01 confirmed:** if some vendors in a multi-vendor package accept and another declines, keep the confirmed services and let the customer select a replacement for the unconfirmed component. A replacement needs its own availability/acceptance and price/scope review; do not silently change other confirmed services. Detailed replacement pricing and failure/cancellation policies remain open.
- **D07 confirmed:** vendor acceptance confirms the booking; no deposit is required for confirmation. This supersedes earlier vendor-selected confirmation prerequisites. Payment status remains separate from confirmed booking status. Payment due dates, collection of balances, cancellation/no-show policies and capacity reservation before acceptance remain open.
- **D05 confirmed:** vendor onboarding is chargeable; customer onboarding is free. The vendor charge amount, timing, recurrence and refundability are not answered by this clarification and remain open. This does not revoke the explicitly approved optional paid personalised assistance or establish that every customer-facing service is free.

### Personalised assistance scope clarification · 20 November 2026

Confirmed by founder: optional paid personalised assistance includes sourcing, booking, follow-ups, vendor coordination and event-day assistance. On-site assistance is an option subject to availability; purchasing personalised assistance does not automatically guarantee physical attendance. This supersedes earlier statements treating those included tasks as unresolved. Exact fees, service duration/hours, assignment, on-site availability/confirmation process, authority to spend/approve changes, cancellation/refund terms and remedy limits remain open. No 24/7 or guaranteed outcome promise is inferred.


Ocasio connects three experiences: discovering possibilities, finding suitable local vendors, and obtaining dependable clarity through the booking journey. An occasion workspace could connect them without making Ocasio a direct event-service provider. This framing is a proposal, not a confirmed tagline or legal responsibility definition.

Proposed actors: visitor; customer; vendor organisation member; supplier reviewer; support agent; finance operator; content editor; administrator. Business entities, staff roles and whether one person can act as customer and vendor require review.

## Decision register

Confirmed directions and remaining details are distinguished below. All unresolved details remain **Open for review**. An option being listed is not a recommendation to implement every option.

| ID | Decision to settle | Options/considerations | Dependent work |
|---|---|---|---|
| D01 | Confirmed: individual and customer-customisable multi-vendor offerings | Confirmed components remain booked; customer replaces declined vendor. Open: package ownership, repricing and post-confirmation changes | Data model, component confirmation/cancellation |
| D02 | Confirmed: fixed pricing and custom quotes by service | Open: category mapping and quote rules. Vendor reconfirmation is required; do not assume instant confirmation | CTAs, quote editor, confirmation rules |
| D03 | Confirmed: customer chooses from Ocasio recommendations | Open: recommendation criteria, shortlist construction and explanation | Profiles, transparency, assignments |
| D04 | Confirmed: optional paid personalised assistance | Sourcing, booking, follow-ups, coordination and event-day assistance; on-site subject to availability. Open: fees, hours, limits and spending authority | Brand promise, support, staffing |
| D05 | Confirmed: vendor commission, one-time and recurring vendor charges after approval, optional paid customer assistance | Customer onboarding free. Open: amounts, billing intervals, one-time/recurring combination or alternatives, mandate choice, refunds and fee basis/trigger | Billing, price display, attribution |
| D06 | Confirmed: customer chooses direct-vendor or through-Ocasio payment | Open: provider feasibility, receipts, settlement/refunds and route granularity in packages | Payment integration, reconciliation, refunds |
| D07 | Confirmed: vendor acceptance confirms without deposit | Open: capacity hold before acceptance, response expiry and amendment rules. Payment state is separate | State machine and capacity reservation |
| D08 | Confirmed direction: according to vendor terms shown to customer | Open: permitted milestones, timing, non-payment handling and rules consistent with no deposit required to confirm | Payment schedule, reminders, overdue actions |
| D09 | Confirmed direction: standard Ocasio cancellation rules informed by legal/industry research | Open: category/time bands, amounts, actual costs, supplier fault, rescheduling and remedies. No blanket industry percentages adopted | Versioned policies, refunds, changes |
| D10 | How does completion become final? | Mutual confirmation; customer confirmation; vendor claim plus dispute window | Reviews, fees, payouts |
| D11 | What is vendor admission policy? | Evidence, references, site checks, trial status, renewal and appeal | Onboarding and trust badges |
| D12 | Who can publish reviews? | Booking-verified only; imported/external reviews separately labelled; anonymous/display names | Review schema and moderation |
| D13 | What are support and remedy commitments? | Hours, response targets, escalation, replacement limits, refund authority | Help UI, event-day workflows |
| D14 | Which occasions and service categories are supported? | Founder-selected taxonomy and category-specific requirements | Navigation, brief schema, matching |
| D15 | What is exact geographic coverage? | NCR localities/postcodes; Karnal/Muzaffarnagar boundaries; travel rules | Eligibility, quotes and public claims |
| D16 | What is account and verification experience? | Email/password; email link; phone OTP; social login; guest enquiry | Identity, cost, recovery, spam controls |
| D17 | How do vendor organisations work? | One owner; teams; multiple businesses; branches; staff permissions | Ownership and tenancy |
| D18 | How do conversations happen? | In-product messaging; external channel with recorded milestones; hybrid | Attachments, privacy, record keeping |
| D19 | Can customers collaborate on an occasion? | Private owner only; invited family/planners; view/comment/approve roles | Invitation and approval permissions |
| D20 | How are recommendations ranked? | Relevance, coverage, availability confidence, quality evidence; labelled sponsorship | Search, auditability, explainability |
| D21 | What content is publishable? | Vendor work, actual customer stories, licensed editorial concepts; approval process | Content model, rights, claims |
| D22 | Which languages and accessibility target? | English/Hindi/others; proposed WCAG 2.2 AA | Content production, localisation, QA |
| D23 | DPDP and applicable privacy/security requirements expressly requested | Research current versus future commencement; implement purpose/access/retention/rights/breach controls after applicability review | Data lifecycle and integrations |
| D24 | What spending authority do staff have? | Refund/credit limits, sensitive changes, dual approval | Admin permissions and audit |
| D25 | Which operating targets and budget? | Traffic/concurrency assumptions, availability, performance, recovery and cost | Hosting, load tests, alerting |
| D26 | Which supporting vendors/tools? | Identity, payments, email/SMS/WhatsApp, storage, ORM, queue, analytics, monitoring | Integration contracts and procurement |
| D27 | Which advanced features justify inclusion? | AI idea assistance, visual search, budget tools, native app, vendor subscriptions | Separate research; not core by default |
| D28 | Deep India launch legal review expressly requested | Consumer/e-commerce rules, payments, tax, entity/contracts, DPDP and category/local requirements; CSRF protection separately confirmed as application security | Professional review and launch gates |

## Confirmation process

### Founder response recorded · 20 November 2026

The founder answered the first seven discussion questions. C13–C18 and D01–D03/D05–D07 record the specific directions selected. Response 4 was “yes” to a question offering multiple post-booking responsibility levels; it does not identify which level. That ambiguity was subsequently resolved by the paid-assistance scope recorded above; it did not itself approve a guarantee. No commercial amounts or payment-provider choice were inferred.

The earlier no-fee-subscription recommendations do not override the founder's selected fixed onboarding charge. Payment of that charge must not be described as quality approval unless a separate admission policy explicitly establishes the actual checks.

When the founder requests questions, review decisions in dependency order: D01–D07 first, then supplier trust/support and scope, then identity/content and supporting technologies. Record selected option, exact rule, approver, date, affected features and acceptance examples. Revising a confirmed rule requires a change record, not a silent rewrite.

No public promise, fee, support guarantee, supplier badge, conversion metric or market-size claim should be inferred from the existence of a page design.

## Latest founder decisions · 23 November 2026

Service payments follow terms shown by each vendor. This sets payment timing, not a deposit prerequisite: vendor acceptance still confirms without deposit. The product must flag and resolve contradictory vendor terms before publishing, rather than silently changing the confirmed rule.

One-time and recurring vendor charges are both supported, payable after approval. Whether every vendor pays both or selects an alternative plan, billing periods/amounts, activation, mandate and refund rules remain open. Approval is not payment authorisation.

Ocasio will define standard cancellation rules informed by research. No cancellation percentages or periods are approved by this direction. India launch compliance, particularly DPDP, is explicitly in scope; The founder clarified “CRMF” as a typo for CSRF; treat it as application security, not a separate legal framework. See the legal research and implementation register for current/future requirements, evidence and professional sign-off gaps.

## Identity decision — 23 November 2026

D16 resolved by founder: **email/password plus Google**. This supersedes sign-in-method alternatives above. Email verification, password recovery and real authenticated sessions are implemented in the fresh platform; Google requires configured credentials and real-provider validation. No customer-selected vendor/admin role is authorised by this decision. See `../SESSION-HANDOFF.md` and `../platform/docs/IMPLEMENTATION-STATUS.md`.
