**Continuation entry point:** [Session handoff](../SESSION-HANDOFF.md) records current implementation and latest explicit decisions. Older proposed alternatives are not approval.

# Ocasio production website blueprint

Version 0.1 · 20 November 2026 · Research-backed proposal for founder review

This documentation starts from the founders' description. The historical repository, its pages, implementation, policies and technology are not requirements or references for this design. Files are stored in this workspace only for convenient access. No application implementation is part of this deliverable.

## Read in this order

**Implementation starting point:** [Final phased implementation plan](08-PHASED-IMPLEMENTATION-PLAN.md) and [work packages/page coverage](09-EXECUTION-BACKLOG-AND-COVERAGE.md). These consolidate current decisions and supersede older provisional delivery sequencing. Implementation has now started in [the fresh platform](../platform/README.md); [verification/status](../platform/docs/VERIFICATION.md) records the initial foundation and remaining work.

1. [Confirmed vision and decision register](01-VISION-AND-DECISIONS.md)
2. [Proposed pages and feature behaviour](02-PAGES-AND-EXPERIENCE.md)
3. [Domain model and end-to-end workflows](03-DOMAIN-AND-WORKFLOWS.md)
4. [Technical architecture and service contracts](04-TECHNICAL-ARCHITECTURE.md)
5. [Acceptance criteria and delivery gates](05-ACCEPTANCE-AND-DELIVERY.md)
6. [Research evidence and remaining investigations](research/RESEARCH.md)
7. [Latest founder decisions and their implications](06-FOUNDER-DECISIONS-UPDATE.md)
8. [India legal research: current and future requirements](research/INDIA-LAUNCH-LEGAL-RESEARCH.md)
9. [Legal implementation controls and launch gates](07-LEGAL-IMPLEMENTATION-AND-LAUNCH-GATES.md)

**23 November update:** service payments follow disclosed vendor terms; vendor acceptance still confirms without deposit. Vendor charges support one-time and recurring structures payable after approval. Standard platform cancellation rules are selected in principle; amounts/time bands remain open. Deep India launch legal research is now included, with current versus future commencement and outstanding professional reviews. The founder clarified the typo as CSRF protection, an application-security requirement.

The latest founder decision update overrides incompatible alternatives in the initial proposals. Confirmed direction now includes individual/combined offerings, customer choice from Ocasio recommendations, fixed/custom pricing by service, vendor commission plus fixed onboarding charge, both intended payment routes and vendor reconfirmation after requests. Detailed policies remain open as recorded in document 01.

## Status language
Latest booking clarification: vendor acceptance confirms without a deposit; partially confirmed packages retain accepted services while customers replace declined components. Vendor onboarding is paid and customer onboarding is free. Optional personalised assistance remains paid. These decisions supersede earlier configurable-confirmation alternatives; payment schedules and onboarding charge terms remain open.

Latest follow-up decisions: optional paid personalised assistance; multi-vendor packages with customer-replaceable recommended vendors; customer selection of payment route; vendor-defined confirmation prerequisites. These override incompatible earlier alternatives. See the latest clarification in document 01 and the follow-up in document 06.


- **Confirmed:** explicitly stated by the founder in this conversation.
- **Proposed:** a reasoned design recommendation, not an approved requirement.
- **Conditional:** needed only if the linked product option is approved.
- **Open for review:** an unresolved decision; no default may be silently selected.
- **Implementation ready:** requires approved business rules, contracts, designs and acceptance criteria; no feature in this draft is claimed to have reached this status.

Except for the confirmed statements in document 01, all architecture, page names, routes, feature scope, data structures and acceptance targets are proposals for review. “Must” within a proposed feature describes what a complete implementation of that option would require; it does not approve the option itself.

## Scope and boundaries

The goal is the intended mature production experience, not a temporary landing page or a deliberately limited startup demo. Sequence work into complete customer journeys; do not confuse sequencing with shrinking the final vision. A feature is complete only when its UI, backend, storage, access control, failure handling, operations and verification work together.

This is a discovery-stage technical blueprint. It is deliberately not a fabricated final database schema, fixed commercial policy, approved UX design or implementation estimate. Decisions that affect money, responsibility, permissions and booking confirmation must be settled before dependent functionality is implemented.

Questions are recorded for later discussion rather than asked now, as requested. Earlier business-report commission percentages, budgets, launch caps and initial category suggestions are not founder-approved requirements and are not inherited here.
