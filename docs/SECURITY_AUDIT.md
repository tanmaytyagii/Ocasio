# Ocasio — Security Audit

**Date:** 2026-10-31
**Scope:** the whole repository, as it stands with the Phase 1 (launch readiness) and Phase 2
(Razorpay, daily capacity) changes — database migrations and RLS, edge functions, payment
integration, frontend, configuration, dependencies, secrets and git history, CI.
**Method:** code review, then verification against a running system — the live database catalog,
PostgREST and the Supabase gateway, the real Deno edge runtime, and a real browser. Every fix has a
regression test, and the important ones were mutation-tested: the fix was reverted to confirm the
test fails without it.
**Audience:** engineers maintaining Ocasio, and whoever decides when it goes live.

Severity reflects **actual risk in this codebase**, not the label an advisory carries: a "critical"
in a tool that never runs in production is not critical here.

---

## Summary

| Severity | Found | Fixed | Open or accepted |
|---|---|---|---|
| High | 0 in this audit (1 earlier in this release — P-1, fixed) | — | 0 |
| Medium | 4 | 4 | 0 |
| Low | 12 | 7 | 5 (4 open, 1 accepted) |
| Informational | 3 | — | 3 (accepted) |

No finding allows an unauthenticated or unauthorised user to read another user's data, move money,
or change a booking's state. The open items are configuration a person must apply, dev-tooling
upgrades, and accepted trade-offs — each listed with what would close it.

---

## Findings

| ID | Finding | Severity | Evidence | Fix | Status |
|---|---|---|---|---|---|
| F-01 | `payments-reconcile` could be invoked by anyone holding the public anon key, and then ran a service-role reconciliation sweep that writes audit rows | Medium | The function had no caller check; the gateway's JWT check accepts the anon key, which is itself a valid JWT. Demonstrated live: with the check reverted, a request carrying only the anon key returned **HTTP 200** | The function now requires the service-role key, compared in constant time (`hasServiceRoleKey`, `supabase/functions/_shared/http.ts`) | **Fixed.** `tests/edge/functions.test.ts` (live: anon → 403, user → 403, service role → 200); `tests/security-hardening.test.ts` |
| F-02 | Runtime dependencies shipped with known advisories: `react-router-dom` 6.30.0 (GHSA-2w69-qvjg-hvjx, XSS via open redirects; GHSA-2j2x-hqr9-3h42), `@supabase/auth-js` ≤ 2.69.1 | Medium | `npm audit --omit=dev`: 3 high, 1 moderate, 2 low before the fix | `react-router-dom` → 6.30.6, `@supabase/supabase-js` → 2.50.0 (first release on patched `auth-js` 2.70; the newest 2.x added 30 KB gzip to the main bundle for no security gain) | **Fixed.** Runtime: 0 high/critical. Residual: 2 moderate react-router advisories fixed only in 7.18 (a major); the one reachable here — backslash open redirect via `navigate` — is already refused by `src/lib/returnPath.ts` (30 tests, including `/\evil.test`) |
| F-03 | CI supply chain: third-party actions referenced by mutable tags (`@v4`), checkout persisting the token, no secret scanning, no dependency gate | Medium | `.github/workflows/ci.yml` before this audit | Every action pinned to a full commit SHA; `persist-credentials: false`; read-only token with per-job scopes; new **Security** job (runtime `npm audit` gate, gitleaks, dependency review on PRs) | **Fixed.** Validated with actionlint (incl. shellcheck); see [CI_CD.md](./CI_CD.md) |
| F-08 | The demo catalogue listed ten **real hotel brands** (Taj Palace, The Oberoi, Grand Hyatt, JW Marriott, …) as Ocasio vendors with invented ratings, review counts and prices, and gave every vendor contact details drawn from realistic ranges — a random Indian mobile number can be a real person's, a `.com` domain a real business's | Medium | `src/utils/dataGenerator.ts`, `supabase/seed.sql` | Venues renamed to invented names; phones `+91 00000 …` (no Indian number has 0 after the country code); email and website on RFC 2606 `.example`. Seed regenerated — only those fields changed; every other value is byte-identical | **Fixed.** `tests/seed-data.test.ts` guards names, phones, domains and that `seed.sql` matches the generator |
| F-04 | `anon` and `authenticated` held `TRUNCATE`, `TRIGGER` and `REFERENCES` on every table — Supabase defaults. RLS does not govern `TRUNCATE` | Low | Catalog: `information_schema.role_table_grants`. Not reachable through PostgREST or GraphQL (no verb for any of them; `pg_graphql` is not installed) | Revoked, and default privileges changed so future tables start without them (migration `20261031000001`) | **Fixed.** `tests/security-hardening.test.ts` |
| F-05 | Dev-tooling advisories. Fixed only by semver-major upgrades: `vitest` and `tinypool` (3 critical), `vite` (8, one high: Windows `launch-editor`; dev-server `fs` bypasses), `@vitest/mocker` (2), `esbuild` (1). With **no fixed release at all**: `minimatch` < 11.0.1 (GHSA-g3hv-75wg-m249, moderate denial of service through crafted patterns, published during this audit), required by every ESLint and typescript-eslint release including the latest | Low | `npm audit`, final run: 17 advisories over 20 packages (by package: 2 critical, 1 high, 17 moderate). Two are the runtime react-router advisories in F-02; the other 15 are dev-only. A second advisory published during the audit, `glob` GHSA-3g3m-2fjr-6pw4, was fixable in range | `glob`: **fixed** — `sucrase` 3.35.0 → 3.35.1 (Tailwind's config loader) no longer depends on it; `package.json` unchanged. The rest: none in this audit. **Exposure:** none of it ships to browsers; the vitest critical needs the Vitest UI server, which this project never runs; the tinypool gadget needs attacker-controlled pool options; the Vite issues concern the local dev server and Windows; `minimatch` only ever sees glob patterns developers wrote into the lint configuration. Vite 5 → 8 and Vitest 2 → 5 (npm's suggested fixes) are a toolchain change of their own | **Open (tracked).** CI reports them on every run, visibly, without failing the build; the runtime gate fails on any high/critical. `minimatch` closes when ESLint ships on ≥ 11.0.1 |
| F-06 | Signed-in RPCs — `create_booking`, `create_payment_for_booking`, `cancel_payment`, `create_review`, `request_vendor_onboarding`, `moderate_vendor`, `admin_list_vendors` — were executable by `anon` | Low | Each refused a caller without `auth.uid()`, so anon only ever got an error | `EXECUTE` revoked from `anon` (migration `20261031000001`) | **Fixed.** The anon key now gets "permission denied" before the body runs; the exact set of definer functions anon may still call is pinned by a test |
| F-07 | Four functions ran with a mutable `search_path`: `search_vendors`, `filter_options`, `category_counts`, `find_stale_payments` | Low | Catalog: `pg_proc.proconfig`. Every `SECURITY DEFINER` function was already pinned; these are invokers, and clients cannot create objects in `public` | Pinned (`''`, or `public, pg_temp` for the pg_trgm-dependent search) | **Fixed.** An invariant test now requires a pinned `search_path` on every application function |
| F-09 | A seeded vendor's page showed its invented review count as real reviews ("4.4 · 331 reviews"); the honest branch ("Sample rating — no customer reviews yet") was unreachable for seeded vendors | Low | `src/pages/VendorPage.tsx` tested `review_count > 0 \|\| !rating_is_demo`; seeded vendors have both a count and the flag | Decide on `rating_is_demo` alone — it clears for good on the first genuine review | **Fixed.** `e2e/launch-readiness.spec.ts` |
| F-10 | The initial commit contains a hosted Supabase project's `anon` key in `.env` | Low | Every JWT in all 69 commits decoded (claims only): this is the only hosted one — `iss: supabase`, `role: anon`, in `6dc2bc1`; `4fd1ba9` changed only the URL, `3f85c18` removed the file. No service-role key, JWT secret, database password or other secret anywhere in history. The project's hostname **no longer resolves** (2026-10-31; `supabase.co` itself does), so the project appears deleted and the key opens nothing | No history rewrite: an anon key is public by design, it has been on GitHub since the first commit — a rewrite would not take it back — and the project is gone. Allowlisted by exact commit in `.gitleaks.toml`, pointing here | **Mitigated — owner to confirm** in the Supabase dashboard that the project is deleted ([OCASIO_DEPLOYMENT.md](./OCASIO_DEPLOYMENT.md#7-launch-checklist) §7) |
| F-11 | Password minimum of 6 characters | Low | `supabase/config.toml`, `src/lib/authErrors.ts` | Raised to 8 (NIST SP 800-63B's floor) in both; `secure_password_change` enabled | **Fixed locally** — `tests/security-hardening.test.ts` signs up with 7 characters and is refused. **The hosted project must be set to match** ([OCASIO_DEPLOYMENT.md](./OCASIO_DEPLOYMENT.md) §2) |
| F-12 | `img-src https://*.supabase.co` matches every Supabase project, and vendors control image URLs (`hero_image_url`, portfolio rows) — an approved vendor could embed images from their own project, e.g. a tracking pixel | Low | `vercel.json`; RLS lets owners write those columns | Every production build adds a meta Content-Security-Policy, derived from `vercel.json`, whose `img-src` and `connect-src` name only that build's `VITE_SUPABASE_URL` origin (`vite.config.ts`). Browsers enforce it together with the header, so the effective allowlist is the one project; Preview and Production each pin their own with no hosts to maintain | **Fixed.** `tests/csp-pinning.test.ts`; `e2e/launch-readiness.spec.ts` shows an image from another `*.supabase.co` project refused |
| F-13 | `style-src 'unsafe-inline'` | Low | Required: Razorpay's `checkout.js` injects `<style>` elements and `style` attributes, measured under the policy in Chromium | Kept. The app has no HTML-injection sink (no `dangerouslySetInnerHTML`, `innerHTML` or `eval` anywhere in `src/`), so CSS injection would need a second bug | **Accepted** |
| F-17 | No application-level rate limiting on `payments-create-order` or `payments-refund`. Order creation was already bounded (one order per booking), but each refund request reaches Razorpay, so one vendor account could split a payment into hundreds of ₹1 refunds and spend the merchant's Razorpay API quota | Low | `supabase/functions/_shared/{createOrder,refund}.ts` | Per-user budgets counted in Postgres (migration `20261031000002`, `consume_rate_limit()`, service role only): 20 order requests and 10 refund requests per user per 10 minutes, answered with 429 and `Retry-After`; fails closed if the budget cannot be checked. The webhook is deliberately unlimited — Razorpay must never be throttled, and it checks the signature before any database work | **Fixed.** `tests/razorpay-payments.test.ts` ('request budgets') |
| F-18 | Email confirmation is off in the local config | Low | `supabase/config.toml` (`enable_confirmations = false`) — kept off locally because the auth flows and tests rely on it. The app is ready for it on: `src/pages/Auth.tsx` treats a sign-up with no session as "confirmation required" and says so, and `src/lib/authErrors.ts` maps "Email not confirmed" at sign-in (code inspection; not exercised automatically, as the local stack runs with it off) | Turn it on in the hosted project | **Open — deploy-time** ([OCASIO_DEPLOYMENT.md](./OCASIO_DEPLOYMENT.md) §2) |
| F-19 | `SECURITY.md` sends reporters to GitHub's private vulnerability reporting, which is **disabled** on the repository, so the documented reporting path does not work | Low | GitHub API `GET /repos/tanmaytyagii/Ocasio/private-vulnerability-reporting` → `{"enabled": false}` | Owner enables it (Settings → Code security → Private vulnerability reporting). `SECURITY.md` now also gives a fallback that discloses nothing publicly | **Open — owner action** ([OCASIO_DEPLOYMENT.md](./OCASIO_DEPLOYMENT.md#4-github) §4) |
| F-14 | Browser functions answer CORS with `*` | Info | `supabase/functions/_shared/http.ts` | Authorisation is a bearer token in a header, never a cookie, so another origin gains nothing it could not already do with the token | Accepted |
| F-15 | Sessions live in `localStorage` (supabase-js default) | Info | — | Readable by injected script; the strict `script-src` and the absence of injection sinks are the mitigation | Accepted |
| F-16 | `citext` and `pg_trgm` are installed in `public` | Info | Catalog | Moving extensions under live columns is riskier than the linter warning | Accepted |

### Fixed earlier in this release (Phase 2)

Recorded here so the audit trail is complete.

| ID | Finding | Severity | Fix |
|---|---|---|---|
| P-1 | `write_audit()` was `SECURITY DEFINER` and executable by `anon`: anyone with the anon key could insert audit rows recorded as `system`, e.g. a forged `refund.succeeded` (demonstrated with a rolled-back insert) | High | Revoked from `anon` and `authenticated` (migration `20261030000001`); test in `tests/razorpay-payments.test.ts` |
| P-2 | `refund_payment` compared requests with confirmed refunds only, so concurrent pending refunds could together exceed what was paid | Medium | Pending refunds reserve their amount, under the payment row lock |
| P-3 | Two simultaneous refund requests with one key: the second failed on the unique key instead of returning the first's refund | Low | Key re-checked under the lock; deterministic two-transaction test |
| P-4 | Provider names were free text, so `'Razorpay'` bypassed rules keyed on `'razorpay'` | Low | `payments_provider_lowercase` check constraint |

---

## Verification

### Authorization (realistic roles against real Postgres)

| Property | Proven by |
|---|---|
| Customers cannot read or change other customers' bookings, payments or refunds | `tests/rls-authorization.test.ts`, `tests/bookings-authorization.test.ts`, `tests/payments-authorization.test.ts` |
| Vendors cannot read or modify other vendors' listings, services, media or bookings | `tests/rls-authorization.test.ts`, `tests/vendor-workspace.test.ts` |
| A vendor cannot book or approve their own listing; only the vendor owner accepts, declines or completes | `tests/bookings-authorization.test.ts` |
| A user cannot set their own role, including through `user_metadata` | `tests/rls-authorization.test.ts`, `tests/vendor-moderation.test.ts` |
| Only an admin can moderate vendors; the console shows a non-admin nothing | `tests/vendor-moderation.test.ts`, `e2e/vendor-onboarding.spec.ts` |
| Booking status changes only through `transition_booking_status()`; direct writes match zero rows | `tests/bookings-authorization.test.ts` |
| Vendor daily capacity cannot be exceeded, including by concurrent acceptances | `tests/booking-capacity.test.ts` — two real transactions; the second is shown waiting on the vendor-row lock, then refused |
| Every table has RLS; money and trust tables have no client write policy; every application function pins `search_path` | `tests/security-hardening.test.ts` (invariants for future migrations too) |
| Server-side authorization is independent of the UI | All of the above call PostgREST or the functions directly, never through the UI |

### Payments (Razorpay mocked at the HTTP boundary; database and transactions real)

| Requirement | Result | Proven by |
|---|---|---|
| 1. A browser cannot mark a payment successful | ✅ | `start_payment` refuses Razorpay payments; settlement functions are `service_role`-only — `tests/razorpay-payments.test.ts` |
| 2. A customer cannot modify the payable amount | ✅ | The browser sends a booking id only; an `amount_minor` in the body is ignored; a mismatched Razorpay order is refused by the database itself |
| 3. A booking cannot have multiple independent orders | ✅ | Unique index `payments_one_razorpay_per_booking`; repeated and simultaneous requests return one order; retries reopen it |
| 4. A duplicate webhook cannot duplicate a transaction | ✅ | `payment_events` unique per `x-razorpay-event-id`; duplicate and same-capture-new-id deliveries settle once |
| 5. A failed event cannot reverse a captured payment | ✅ | Late `payment.failed` ignored once settled; a redelivered failure cannot fail a reopened attempt (replay guard, mutation-tested) |
| 6. Refunds cannot exceed the captured amount | ✅ | Pending refunds reserve; concurrent same-key requests reach Razorpay once (two-transaction test) |
| 7. Unauthorized users cannot refund | ✅ | Customer, other vendor and anonymous callers refused before Razorpay is called |
| 8. Captured payments are recorded even after checkout was abandoned | ✅ | Capture after cancellation is applied and audited `payment.needs_review` |

Signature verification is HMAC-SHA256 over the raw body with Web Crypto's constant-time `verify`
(`tests/webhook-signature.test.ts`, including the published test vector and re-serialised JSON).

### Mutation testing

Each safeguard below was weakened in the running system, and the tests meant to catch it were run
twice: against the weakened code, where they must fail, and again after restoring it, where they must
pass — so an unrelated failure cannot pass for a catch. A mutation whose target text is not found
exactly once aborts instead of passing. Final round, on a database rebuilt from zero: **every
mutation caught, every control passing, every mutated file restored byte-for-byte.** Earlier rounds
found two test gaps this way, both fixed: a replay guard masked by a second check, and an ownership
check whose mutation had silently failed to apply.

| Area | Safeguard weakened | Caught by |
|---|---|---|
| Payments (database) | refund reservation · same-key re-check under the lock · capture amount and currency check · payment-event replay guard · order-amount check · refund-event amount check · `start_payment` Razorpay guard · one-payment-per-booking index · `write_audit` closed to clients | `tests/razorpay-payments.test.ts` |
| Capacity | the vendor-row lock | `tests/booking-capacity.test.ts` (the two-transaction tests) |
| This audit's hardening | `TRUNCATE` revoked (F-04) · signed-in RPCs closed to anon (F-06) · pinned `search_path` (F-07) · no client write policy on money tables · RLS on every table | `tests/security-hardening.test.ts` |
| Edge-function handlers | webhook signature verification · order lookup by receipt · refund lookup by receipt · refund submission claim · service-role key comparison (F-01) | `tests/webhook-signature.test.ts`, `tests/razorpay-payments.test.ts`, `tests/security-hardening.test.ts` |
| Demo data | real brand names (F-08) · realistic phone numbers (F-08) | `tests/seed-data.test.ts` |
| Deployed function | `payments-reconcile` caller check removed from the code being served: the anon key and a signed-in user got **200** | `tests/edge/functions.test.ts`, live (2 failed; 14/14 after restoring) |
| Vendor page | the old rating condition restored, showing invented review counts as real (F-09) | `e2e/launch-readiness.spec.ts`, against the production build |
| Request budgets (F-17) | limit never enforced · read-then-write counter instead of the atomic upsert · `EXECUTE` granted to signed-in users · create-order not spending a budget · refund not spending a budget · failing open when the budget cannot be checked · one bucket for every kind of request | `tests/razorpay-payments.test.ts` ('request budgets'), including a two-transaction test showing the second request waiting on the first's row lock — 7 of 7 caught |
| CSP pinning (F-12) | the meta policy no longer added to production builds | `e2e/launch-readiness.spec.ts` — an image from another `*.supabase.co` project loads |
| Secret scanning | the `.gitleaks.toml` allowlist | a planted service-role JWT and RSA private key are still detected (2 leaks) |

### Secrets

- gitleaks 8.30.1 over the working tree and every commit, with `.gitleaks.toml`: **no leaks**. Without
  the allowlist it reports the published Supabase local-development keys (`iss: supabase-demo`) used
  by the test harness, fake test fixtures, and F-10.
- A planted service-role JWT and RSA private key **are** detected with the allowlist in place, so it
  hides nothing real.
- `.env` and `.env.*` are ignored except the two templates; templates contain placeholders only.
  No service-role key, Razorpay secret or webhook secret appears in the repository.

---

## Residual risks

| Risk | Why it remains | What closes it |
|---|---|---|
| Payment reconciliation | `payments-reconcile` has no Razorpay adapter: a capture whose webhook never arrives (after Razorpay's 24 hours of retries) stays "awaiting confirmation" | A Razorpay `ReconciliationProvider` (`GET /orders/{id}/payments`) |
| Audit events nobody sees | Rows that need a person (`payment.needs_review`, `payment.capture_conflict`, `payment.duplicate_capture`, `payment.verification_failed`, `refund.verification_failed`, `refund.state_conflict`) have no alert or screen | Alerting on those actions, or an admin view |
| Razorpay webhook failure | If deliveries keep failing for 24 hours Razorpay disables the webhook; only its alert email says so | A monitored alert inbox; periodic check of the webhook's delivery log |
| Production payment verification | Everything was tested against a stand-in for Razorpay's API and a fake key; no request has reached Razorpay's servers | The ₹1 live payment and refund in [OCASIO_DEPLOYMENT.md](./OCASIO_DEPLOYMENT.md) §6.5 |
| CI has not run on GitHub | The workflow was validated locally (actionlint, and every step reproduced on a fresh stack) but has never executed on GitHub | Push, then require all six jobs on `main` ([CI_CD.md](./CI_CD.md)) |
| Dev-tool advisories (F-05) | Major toolchain upgrade; no upstream `minimatch` fix for ESLint yet | Vite 8 / Vitest 5 upgrade task; an ESLint release on `minimatch` ≥ 11.0.1 |
