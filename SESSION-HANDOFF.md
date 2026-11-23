# Ocasio — start here when continuing

Updated 23 November 2026. This file is the durable session handoff. Read this, `platform/docs/IMPLEMENTATION-STATUS.md`, `platform/docs/VERIFICATION.md`, then `product-planning/08-PHASED-IMPLEMENTATION-PLAN.md` and `09-EXECUTION-BACKLOG-AND-COVERAGE.md` before changing the product.

## Working agreement

- All user-facing replies must be in English, even when the founder writes Hindi.
- Continue implementation, not just planning. The founder wants complete, production-quality journeys and careful research; do not call the whole platform finished because scaffolding runs.
- Do not infer business-policy approval. Record unresolved commercial/legal questions as open. Ask substantive founder questions when requested; do independent authorised work meanwhile.
- The old application at the repository root is historical reference only. Its pages, models and policies are not requirements. New implementation lives in `platform/`.
- Next.js frontend, NestJS backend, PostgreSQL are explicitly selected. Other supporting technology can be chosen with reasons. The founder authorised parallel agents.
- Preserve existing local/user work. Never reset the application database. Never publish, send external messages, charge money or fabricate inventory/testimonial evidence without the appropriate instruction.
- The founder requested pushing all source, research, documentation and session context to this remote so another Codex account can continue. Secrets, database files, backups, dependencies and compiled artifacts are deliberately excluded. A private repository is still not a secret store.

## Founder-confirmed product

Ocasio is a marketplace making quality local event vendors discoverable and reachable, founded by three developer friends. Two founders are from Karnal, one from Muzaffarnagar; they study/work in Delhi NCR. Initial intended geography is Delhi NCR, Karnal and Muzaffarnagar, not verified live service coverage.

Customers choose individual services or customised multi-vendor packages from Ocasio recommendations. Recommended vendors in a package can be changed by the customer. Both fixed prices and personalised quotes depend on service. Vendors keep current offerings available and reconfirm each request. **Vendor acceptance confirms the service without a deposit**. Payment schedules follow disclosed vendor terms. When one package component declines, retain accepted services and let the customer choose a replacement.

Customer onboarding is free. Vendor revenue includes commissions and approved one-time/recurring onboarding/commercial charges payable after approval. Exact amounts, intervals, whether both apply per vendor, triggers and overdue consequences are open. Customer chooses direct-vendor or through-platform payment; provider/legal feasibility for both is still a gate.

Optional personalised assistance is paid: sourcing, booking, follow-ups, coordination and event-day help on the customer's behalf. On-site support is subject to availability. Assistance pricing, authority, staffing, hours, cancellation and refund details remain open.

A standard cancellation policy is intended, but no percentages/time bands/remedies or unpaid-booking liability are approved. Legal/DPDP research is in `product-planning/research/INDIA-LAUNCH-LEGAL-RESEARCH.md`; research is not legal clearance. “CRMF” in the conversation was a typo for **CSRF**.

Latest explicit identity decision: **email/password plus Google**. No phone OTP is selected. Account identity does not confer vendor/staff/admin privileges.

## What exists

`platform/` is an npm workspace with `apps/web`, `apps/api`, `apps/worker`, `packages/contracts`, `packages/database`. Node 22, Next.js 16, React 19, NestJS 12, TypeScript, explicit `pg` SQL, Better Auth 1.7.27, express-session/PostgreSQL CSRF context, nodemailer/Mailpit.

- Provisional editorial website: home, explore, story, loading/error/404. Actual API returns three **research-only** markets. No vendor inventory, reviews, quotes or fake bookings.
- Database checksum/advisory-lock migrations, seed, shared validation, safe request IDs/errors, readiness, private backup command, outbox diagnostic worker with idempotence/retry/dead-letter tests.
- Browser CSRF context in PostgreSQL with exact origin/token checks, cookie controls, same-origin Next proxy. This cookie is distinct from the actual Better Auth identity cookie.
- Real email/password registration, required email verification, login, account page, logout, password reset and session revocation. Passwords are library-hashed, minimum12/maximum128; these engineering defaults remain subject to security review. Google integration is configured only with both credentials; no real Google account login has been validated.
- Authentication email is durably queued encrypted; local worker hands it to Mailpit, retries with leases, clears payload after successful handoff. No external production mail provider or real-customer delivery is configured.
- CI workflow is `.github/workflows/platform.yml`. Local test evidence is in `platform/docs/VERIFICATION.md`; a push is not evidence that remote CI passed.

Migrations: `001_foundation.sql`, `002_sessions.sql`, `003_auth.sql` generated from pinned Better Auth schema, `004_auth_mail.sql`. Do not edit applied migrations; add new ones. `auth.mts` provides the library's ESM boundary while the Nest application remains CommonJS under NodeNext compilation.

## Resume locally

```sh
cd platform
npm ci
npm run setup:local
npm run db:up
docker compose up -d mailpit
npm run db:migrate
npm run db:seed
npm run dev
```

Website `http://127.0.0.1:3000`; API4100; PostgreSQL55432; Mailpit inbox `http://127.0.0.1:8035` (SMTP1025). Use **127.0.0.1**, not an interchangeable localhost origin, for CSRF/callback consistency. `npm run build && npm run preview` serves compiled local preview; it is not a hosted production deployment. Existing unrelated port4000 process was not touched.

`npm run setup:local` creates an ignored private `.env` and random session secret without printing it. New machine/account creates its own local database and secret. Existing database contents do not travel through Git. On the original machine Docker volume and ignored backups remain local; a separate restore rehearsal DB was retained as `ocasio_restore_20261123185957`. Do not export account data into the repo to recreate it.

Google needs the owner's real OAuth credentials in ignored environment settings. Callback: `WEB_ORIGIN/api/v1/auth/callback/google`. See `platform/docs/AUTH-SETUP.md` for SMTP, Google and security limitations. Never invent working credentials or claim end-to-end Google success without provider validation.

Checks: `npm test`, `npm run test:integration`, `npm run typecheck`, `npm run build`. Integration suites create/drop only their own newly named databases. Auth-mail integration also requires local Mailpit (CI service). No test-only login bypass exists.

## Verification at handoff

39 tests passed (6 unit/contract and33 integration), none skipped; full build and workspace type checks passed. Browser sign-in/registration/recovery states were reviewed. Mailpit receives synthetic test messages. Real Google login/production email, business permissions and marketplace transactions remain untested or unimplemented as stated above.

## Next implementation slice

Finish and verify identity authorisation boundaries before business mutations: customer/vendor organisation membership, explicit invitation and staff-role grants, deny-by-default object ownership, negative cross-account tests and audited privileged actions. Registration must never accept elevated roles. Exact vendor organisation structure and staff approval authority require founder clarification before selecting their product rules.

Then follow the phased plan: supplier admission/evidence and paid commercial acceptance; catalogue/coverage publishing; offers, requests and transactional vendor acceptance/capacity; partial packages/replacements; paid assistance assignment/scope; both payment routes and reconciliation; cancellation/refunds/disputes; completion/reviews; support/privacy lifecycle; production operations and launch gates. Build only complete authorised slices. Read the backlog for full coverage and dependencies, not this summary alone.

Still open: final brand kit/content, fee/commission policies, supplier admission criteria, exact coverage/categories, assistance scope/pricing/authority, standard cancellation/remedies, payment-provider feasibility/mandates, tax/invoicing, staffing/incident ownership, legal/privacy sign-off, consent/retention/deletion, production TLS/secrets/hosting/mail/Google approvals. No phase-wide production acceptance is claimed.
