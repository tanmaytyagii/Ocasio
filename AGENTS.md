# Ocasio agent instructions

- Always write user-facing replies in English, including progress updates, regardless of the user's language.
- Read `SESSION-HANDOFF.md` before continuing work. It records founder decisions, implementation state, verification, open issues and local setup.
- The active implementation is `platform/`; the root application is historical and must not define the new product's pages or policies.
- Follow `product-planning/08-PHASED-IMPLEMENTATION-PLAN.md` and `09-EXECUTION-BACKLOG-AND-COVERAGE.md`; later explicit founder decisions override older proposals.
- Do not silently resolve open business/legal policies or claim production readiness from local scaffolding.
- Keep secrets, accounts, tokens, database dumps and generated dependencies/build artifacts out of Git. Never reset the application database; tests may remove only their own newly created disposable databases.
- Update implementation status, verification evidence and session handoff when completing a meaningful slice.
