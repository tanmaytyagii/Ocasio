# Foundation verification · 23 November 2026

Local execution evidence, not production certification or full-phase acceptance.

## Latest: account identity and local mail · 23 November 2026

**39 tests passed: 6 unit/contract + 33 PostgreSQL/API/worker integration tests; none failed or skipped.** Full compiled build and all workspace type checks passed. Migrations003/004 applied to the local application database without a reset. All integration suites created and removed only their own disposable databases. Mail tests require local Mailpit; the CI workflow now includes that service.

New evidence: required email verification, library password hashing, verified login, account identity, logout/captured-cookie revocation, password reset/replay/old-password rejection and session revocation, customer role injection rejection, CSRF/origin enforcement on native auth mutations and persisted429 rate limiting. Google tests used fake credentials only for OAuth initiation URL/state/callback checks and rejection of a missing-state callback. **No real Google login or provider token exchange was tested.**

Six mail tests exercised actual local Mailpit handoff, ciphertext deletion, corrupt payload termination, SMTP refusal and fifth-attempt dead lettering, expired/active leases and concurrent worker claims. These prove ordinary claim isolation, not exactly-once external delivery or crash-after-SMTP deduplication. Only synthetic addresses were used; no production SMTP delivery was attempted.

Browser review observed sign-in, registration with12–128 character guidance, disabled unconfigured Google/local inbox explanation and invalid recovery-link state. No credentials were entered through browser automation. Screenshot: [sign-in](screenshots/sign-in.jpg). Compiled preview remains at `http://127.0.0.1:3000/sign-in`; local inbox8035.

Current identity/security scope supersedes historical statements below that sign-in was unimplemented. Business permissions, production OAuth/mail/TLS, vendor operations and transactional workflows remain open. Source and continuation documentation are prepared for the founder-requested remote transfer. Remote CI results must be checked separately; local passing checks do not claim a GitHub run passed.

## Security/session increment · 23 November 2026

The latest run passed **6 unit/contract tests and 17 PostgreSQL/API integration tests (23 total)**, with none skipped. Builds and workspace type checks passed. Migration `002_sessions.sql` applied without resetting the application database. A new local signing secret was generated without printing it; CI uses an ephemeral secret.

New evidence covers durable anonymous sessions across API restart, signed cookie settings, per-session CSRF tokens, exact origin checks, cross-site rejection, expiry, malformed/tampered cookies, destroy/replay, production Secure/host-only cookie configuration and session-store outage without fallback. Security tests use their own newly created database. Customer sign-in and authenticated business permissions are not implemented or claimed.

The original foundation results below remain historical evidence; references there to unimplemented CSRF are superseded by this increment only for the anonymous session surface. See [security scope](SECURITY.md) for the remaining gates.

| Check | Observed outcome |
|---|---|
| Workspace dependency installation | Completed; npm reported zero known vulnerabilities at installation |
| Workspace TypeScript checks | Passed for web, API, worker, contracts and database |
| Unit/contract tests | 3 passed, none skipped |
| Real PostgreSQL/API integration tests | 8 passed, none skipped; each run owns a new disposable database |
| Compiled builds | Next.js, NestJS API, worker and shared packages built successfully |
| Local PostgreSQL | Docker service healthy, migration applied and three intended markets seeded as research-only |
| Read-only API | Coverage uses shared validated schema; invalid query returns safe 400; readiness distinguishes dependency failure with 503 |
| Transaction/outbox tests | Concurrent idempotent creation, rollback, worker receipt deduplication, retry/dead-letter behaviour verified |
| Background worker | Local diagnostic event reached processed state, one attempt, one receipt |
| Backup/restore rehearsal | Private SQL backup restored into a separate newly created rehearsal database; verified three markets, one migration and one processed-job receipt |
| Browser navigation | Home, Explore and Our story inspected; all three actual market records rendered via API; API failure/recovery state also observed during initial integration |
| Mobile layout | Home and story inspected at 390px; document width equalled viewport width; temporary viewport reset afterwards |
| Source boundaries | Historical application files unchanged; new app in platform and separate root CI workflow |

Restore rehearsal database retained locally: `ocasio_restore_20261123185957`. Backup and local environment files are ignored by Git. No production/customer data was used. Restore verification covered this small relational foundation, not object storage or future providers. No recovery-time SLA is claimed.

CI configuration was added at `.github/workflows/platform.yml`; it has not been run on GitHub or pushed. Local checks do not establish remote CI success.

## Limits and next work

Phase 0 remains partial because policy/provider/identity decisions are open. Phase 2 has a working local foundation but lacks staging/production provisioning, full observability, operational incident coverage and production secret management. The frontend is an initial brand/experience scaffold, not completed Phase 1 or Phase 5.

No sign-in, private customer/vendor mutations, CSRF implementation for those mutations, real vendor onboarding, inventory, bookable packages, quotes, payments, fees, assistance delivery, reviews or legal certification is claimed. The next dependent slice is identity/permissions after authentication and organisation requirements are resolved, followed by real supplier admission/publishing.
