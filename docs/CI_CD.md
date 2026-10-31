# Ocasio — CI/CD

**Audience:** anyone changing the pipeline, pushing to `main`, or deploying.

Code moves through one workflow, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), and
deploys through Vercel's Git integration and an explicit, human-run Supabase step. Nothing in CI
deploys anything.

```
push to main  (or a manual run: Actions → CI → Run workflow)
        │
        ▼
 ┌──────────────── CI (GitHub Actions) — six jobs, all required ────────────────┐
 │ static · security · edge-functions · integration · edge-functions-live · e2e │
 └───────────────────────────────────────────────────────────────────────────────┘
        │ all green, reviewed, merged to main
        ▼
 Vercel builds main → production                             Supabase: `supabase db push`
 build failure = no deployment                                and `functions deploy`, by a person
```

---

## 1. The jobs

| Job | Runs | Proves |
|---|---|---|
| **Typecheck, lint and build** | `npm ci`, `tsc -b`, `eslint --max-warnings=0`, `vite build` | The code compiles, lints clean, and bundles |
| **Security (dependencies and secrets)** | `npm audit --omit=dev --audit-level=high` (blocking); `npm audit` (reported); gitleaks 8.30.1 with `.gitleaks.toml`; dependency review of everything the push added, previous `main` → this commit (fails on high) | Nothing shipped to browsers carries a high or critical advisory; no secret enters the repository; a push adds no vulnerable dependency |
| **Edge functions (deno check)** | `deno check supabase/functions/*/index.ts` | Every function type-checks as Supabase will run it |
| **Integration tests (Vitest + Postgres)** | `supabase start` on an empty runner — **every migration applied from zero**, then the seed; `supabase db lint --fail-on warning`; `npm test` | The schema builds from source control alone; functions pass plpgsql_check; 458 tests against real RLS, real locks and real transactions, Razorpay stubbed at the HTTP boundary |
| **Edge functions (live, Deno runtime)** | `supabase start` with the edge runtime, `supabase functions serve` with test-only configuration, `npm run test:edge` | The real Deno entry points behind Supabase's gateway: per-function JWT settings, CORS, webhook signatures, the scheduler-only check, Razorpay outage handling |
| **End-to-end tests (Playwright)** | Fresh stack; production build served with the `vercel.json` headers; desktop and mobile Chromium | Real user journeys under the production Content-Security-Policy, at phone, tablet and desktop widths |

**Nothing is skipped silently.** The database suites run with `OCASIO_REQUIRE_SUPABASE=1`, which
turns "Supabase unreachable" into a failure instead of a skip; the live edge suite fails if the
functions are not being served. The 11 Playwright tests reported as skipped are deliberate: the
sign-in page's layout sweep in `e2e/auth.spec.ts` sets explicit widths itself, so it runs once, on
the desktop project, and skips on mobile with that reason.

### Coverage map

| Journey | Where |
|---|---|
| Registration, sign-in, return-after-sign-in, error messages | `e2e/auth.spec.ts`, `tests/auth-return-path.test.ts` |
| Vendor onboarding and admin approval | `e2e/vendor-onboarding.spec.ts`, `tests/vendor-moderation.test.ts` |
| Vendor profile, services, portfolio | `e2e/vendor-activation.spec.ts`, `tests/vendor-workspace.test.ts` |
| Booking creation, acceptance, rejection, cancellation | `e2e/bookings.spec.ts`, `tests/bookings-authorization.test.ts` |
| Daily vendor capacity — including **concurrent** acceptance | `e2e/vendor-capacity.spec.ts`, `tests/booking-capacity.test.ts` (two real transactions) |
| Payment order creation, verification, webhook idempotency | `tests/razorpay-payments.test.ts`, `tests/edge/functions.test.ts`, `e2e/payments.spec.ts` |
| Refunds — including **concurrent** same-key requests | `tests/razorpay-payments.test.ts` (two real transactions), `e2e/payments.spec.ts` |
| Role-based access control | `tests/rls-authorization.test.ts`, `tests/security-hardening.test.ts` and every `*-authorization` suite |
| Reviews | `e2e/reviews.spec.ts`, `tests/reviews-authorization.test.ts` |
| Mobile and tablet layout | every spec on the `mobile` project; `e2e/launch-readiness.spec.ts` (768 px, no sideways overflow) |
| Security headers and CSP | `e2e/launch-readiness.spec.ts` |

Concurrency claims rest on tests that hold one transaction open with `pg` and prove the second waits
on the lock — firing requests together over HTTP was shown not to prove it (with the capacity lock
removed, such a test still passed).

---

## 2. Security of the pipeline itself

- **Pinned actions.** Every third-party action is pinned to a full commit SHA, with its release tag in
  a comment. A moved or compromised tag cannot change what runs. Update by re-resolving the tag to a
  SHA, never by switching back to a tag.
- **Least privilege.** The workflow token is `contents: read` for every job. Checkouts set
  `persist-credentials: false`.
- **No secrets.** No job needs one: the stack is local and uses Supabase's published development keys,
  and the Razorpay values in the live edge job are fake, pointed at a closed port.
- **No `pull_request_target`.** Untrusted code never runs with a write token or secrets.
- **No interpolated untrusted input** in `run:` steps.
- **Artifacts.** Only Playwright traces and screenshots of synthetic test data, on failure, kept
  7 days. The gitleaks report is not uploaded.

---

## 3. Running a job locally

| Job | Command |
|---|---|
| static | `npm run typecheck && npm run lint -- --max-warnings=0 && npm run build` (needs the `VITE_SUPABASE_*` variables) |
| security | `npm audit --omit=dev --audit-level=high` · `docker run --rm -v "$PWD:/repo:ro" zricethezav/gitleaks:v8.30.1 dir /repo --config /repo/.gitleaks.toml --redact` (and `git` instead of `dir` for history) |
| edge-functions | `DENO_NO_PACKAGE_JSON=1 npx deno@2 check supabase/functions/*/index.ts` |
| integration | `npx supabase start` · `npx supabase db lint --local --level warning --fail-on warning` · `OCASIO_REQUIRE_SUPABASE=1 npm test` |
| edge-functions-live | `npx supabase functions serve --env-file <file>` with the four `RAZORPAY_*` values from the workflow, then `OCASIO_EDGE_WEBHOOK_SECRET=edge-test-webhook-secret npm run test:edge` |
| e2e | `npx supabase start` · `npm run test:e2e` |

To reproduce CI's **migration-from-zero** check without touching your local data, run a throwaway
copy: copy `supabase/` to a temporary directory, change `project_id` in its `config.toml`, stop your
own stack (`npx supabase stop` keeps its data), and `npx supabase start --workdir <tmp>`. Remove it
with `npx supabase stop --workdir <tmp> --no-backup`, then restart yours.

---

## 4. Deployment

| | Frontend (Vercel) | Database and edge functions (Supabase) |
|---|---|---|
| Trigger | Vercel's GitHub integration: production from `main` (any other branch pushed gets a preview) | A person runs `npx supabase db push` and `npx supabase functions deploy …` — see [OCASIO_DEPLOYMENT.md](./OCASIO_DEPLOYMENT.md) |
| Environments | Preview and Production have **separate** environment variables; Preview points at a staging project | Separate staging and production projects, each with its own secrets |
| Build failure | `npm run build` fails without valid configuration, so Vercel never promotes the deployment | — |
| Secrets | Only public `VITE_*` values live in Vercel | Server secrets via `supabase secrets set`; none in GitHub |
| Status | Vercel posts a deployment status on each commit | Recorded by whoever runs the command |
| Rollback | Vercel → Deployments → **Instant Rollback** (or *Promote* an earlier deployment) | Migrations are append-only; roll forward with a new migration. Redeploy the previous function code from its commit |

Order of operations for a release that changes both: database migration first (migrations here are
additive), then edge functions, then merge to `main` for the frontend.

**Production secrets are never available to pull-request code**: CI uses none, and Vercel's preview
environment uses the staging project's public values only.

---

## 5. GitHub configuration (once)

1. Settings → Rules → Rulesets → New branch ruleset `main-protection`, target the default branch
   (`main`), enforcement **Active**, bypass list **empty** (not even administrators):
   - **Restrict deletions** — `main` cannot be deleted;
   - **Block force pushes** — history on `main` is never rewritten;
   - **Require status checks to pass**, selecting all six: **Typecheck, lint and build**,
     **Security (dependencies and secrets)**, **Edge functions (deno check)**,
     **Integration tests (Vitest + Postgres)**, **Edge functions (live, Deno runtime)**,
     **End-to-end tests (Playwright)**;
   - **no** pull-request or approval requirement: work is pushed directly to `main`.

   Required checks and direct pushes interact: a required check has to have passed on the commit
   being pushed, so with that rule active a direct push of a new commit is refused until its checks
   have run. For direct development, leave **Require status checks** off the ruleset and treat a
   green CI run on `main` as the gate for deploying — Vercel can be set to wait for checks
   (Settings → Git → "Wait for checks") — or push to a short-lived branch, let CI pass there, then
   fast-forward `main`.

   Changes that reach production outside Git — `supabase db push`, `functions deploy`, Razorpay and
   Vercel settings — are applied only from a commit whose CI run on `main` passed.
2. Settings → Actions → General: workflow permissions **read-only**; do not allow Actions to create
   or approve pull requests.
3. Settings → Code security: enable the **dependency graph** (needed by dependency review),
   Dependabot alerts, and private vulnerability reporting (`SECURITY.md` relies on it; it is off
   today — [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) F-19).
4. After the first run on `main`, add the CI badge to the README:
   `[![CI](https://github.com/tanmaytyagii/Ocasio/actions/workflows/ci.yml/badge.svg)](https://github.com/tanmaytyagii/Ocasio/actions/workflows/ci.yml)`
   — it returns 404 until the workflow exists on GitHub, which is why it is not there yet.

---

## 6. Execution status

As of this document the workflow has **not run on GitHub** — the repository's `main` predates it. Every
job's steps were reproduced locally against a fresh Supabase stack (migrations from zero), and the
workflow file passes actionlint, including shellcheck of each `run:` script. The first push is the
first real run; if a job fails there, it is the environment — fix forward, do not disable the check.
