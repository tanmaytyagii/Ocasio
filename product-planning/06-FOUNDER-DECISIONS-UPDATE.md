# Founder decision update · 20 November 2026

This update takes precedence over incompatible alternatives in the original proposal. It records direction, not unapproved implementation details. Source: founder's answers to the first seven questions in the chat.

| Confirmed direction | Required blueprint implications | Still open |
|---|---|---|
| Individual services and combined offerings | Discovery and customer workspace must represent both. Combined offers need component-level scope, supplier identity and status | Single versus multiple vendors; package owner; partial acceptance and cancellation |
| Customer selects from Ocasio recommendations | Vendor brand profiles and credible work presentation are central; recommendations lead to customer selection, not undisclosed assignment | Ranking, matching inputs, explanation and number of recommendations |
| Fixed price and custom quote depending on service | Each service declares its purchase/pricing mode; UI and API use the correct flow | Mode mapping, optional customisations and quote policy |
| Vendor commission plus fixed onboarding charge for now | Vendor commercial onboarding, commission receivables and reconciliation are in scope; exclude unapproved customer fees | Amount, commission base/trigger, charge timing, recurrence/refund and admission relationship |
| Both direct-vendor and through-Ocasio payment options intended | Finance must distinguish routes; booking identifies route and obligations. Platform payment execution depends on provider feasibility | Route selector, eligibility, settlement, receipts/refunds and legal/accounting treatment |
| Availability maintained by vendors plus reconfirmation for each request | Display availability with honest semantics; customer submission waits for vendor response. Fixed price does not imply instant confirmation | Required response time, reservation moment, expiry, payment requirement and resource model |

## Historical ambiguity · resolved by follow-up below

The original answer “yes” did not distinguish responsibility levels. The subsequent clarification below resolves paid assistance; it does not establish unlimited coordination or a 24/7 guarantee.

## Follow-up · latest confirmed decisions

1. **Optional paid personalised assistance:** Ocasio arranges things on behalf of customers to save time, charging a premium. Add a scoped assistance offer, customer acceptance, billing record, assigned operator and task/approval history. Exact tasks, duration, fees, refunds, basic support and on-site involvement remain open. Assistance does not itself authorise unlimited spending or substitutions.
2. **Customisable multi-vendor packages:** Ocasio recommends vendors per component; customers may replace individual vendors. Preserve component scope/supplier versions and revalidate price, compatibility and availability on changes. Partial confirmation, package ownership and post-confirmation replacements remain open.
3. **Customer-selected payment route:** customer chooses direct-vendor or through-Ocasio payment. Provider feasibility and complete route-specific operations remain necessary. Route choice must not silently bypass the vendor's payment prerequisites. Whether the route is selected per package or per component remains open.
4. **Vendor-defined confirmation conditions:** vendor reconfirms requests and determines the conditions for confirmation. Conditions must be disclosed before commitment and snapshotted in accepted terms. Permitted settings, deposit values, deadlines, verification and platform limits remain open. Different vendors in a package may have different requirements; aggregation is not yet decided.

Revenue update: optional customer assistance premium is added to vendor commission and fixed onboarding charge. This supersedes the earlier customer-fee exclusion for this specific service. No general customer booking fee is approved.

## Workflow refinement

### Package, confirmation and onboarding follow-up · latest authority

1. Retain accepted/confirmed vendor services when another package component is declined. Customer chooses a replacement for that component; do not cancel or reconfirm the unaffected services automatically. Revalidate replacement scope, price and availability, then seek replacement vendor acceptance.
2. Vendor acceptance confirms a booking without a deposit. This supersedes the earlier configurable vendor-confirmation proposal. Track payment separately. Do not gate confirmation on checkout or imply deposit is due to secure confirmation. Later payment timing and other commercial policies remain open.
3. Vendor onboarding is paid; customer onboarding is free. Vendor charge amount, timing, recurrence/refundability and link to admission remain unresolved. Optional personalised assistance remains a separately paid service; no general customer booking fee is approved.

Required implementation examples: a four-vendor package with three acceptances shows three confirmed components and one needing replacement; acceptance creates a confirmed supplier booking and committed capacity without requiring payment; replacement changes only the relevant component; customer account/onboarding does not ask for an onboarding payment.

### Assistance scope follow-up · latest clarification

The founder confirms sourcing, booking, follow-ups, vendor coordination and event-day assistance are included in the optional paid personalised assistance service. On-site assistance is subject to availability. Earlier references to those tasks as undecided are superseded.

Product implications: show the included tasks in the assistance offer; keep physical attendance availability distinct from service purchase; provide an explicit on-site request/confirmation state rather than implying attendance. Staff need an assigned assistance record, task history and event-day coverage details. Pricing, hours/duration, staffing confirmation, spending authority and cancellation/remedy policies remain open. Do not infer 24/7 support or unlimited scope.

Confirmed minimum: customer explores Ocasio recommendations → selects an individual or combined offering → follows the service's fixed-price/custom-quote path → submits request → vendor explicitly reconfirms availability. Vendor acceptance confirms without deposit; payment obligations follow the disclosed vendor schedule independently.

Direct payment: evidence, verification, commission collection and dispute handling need complete implementation. Through-Ocasio payment: approved provider collection, refund and settlement arrangements need complete implementation. Neither route is treated as already operational.

## Document interpretation

### 23 November 2026 · latest decisions

Service-payment timing follows vendor terms shown to customers; this does not override acceptance-based confirmation without deposit. Vendor charges support both one-time and recurring structures, payable after approval. Whether both apply to each vendor or are alternative plans, plus prices/intervals/mandates/refunds, remain open. Standard Ocasio cancellation rules will be researched and legally reviewed; no industry tariff or percentages are adopted. DPDP and India launch legalities are expressly in scope. The founder clarified the acronym as CSRF protection; see the architecture security requirements. See the new legal research and implementation documents for evidence and gaps.

The page catalogue remains a proposed design. Apply these decisions to P07–P10, P19–P25, P30–P39, P43–P45 and the related domain/API contracts. Candidate instant-booking flows described earlier are not selected: the founder requires vendor reconfirmation after customer requests. Supporting technology choices and detailed commercial policies remain review items.
