# Contributing to Ocasio

## Getting set up

Node 18+ and Docker are required.

```bash
npm install
npx supabase start
cp .env.local.example .env
npm run dev
```

## Before pushing to `main`

```bash
npm run typecheck                       # must be clean
npm run lint -- --max-warnings=0        # CI allows zero warnings
OCASIO_REQUIRE_SUPABASE=1 npm test      # 458 tests, all must pass
npm run build                           # needs VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run test:e2e                        # 84 tests × desktop + mobile
DENO_NO_PACKAGE_JSON=1 npx deno@2 check supabase/functions/*/index.ts
npm audit --omit=dev --audit-level=high # nothing high or critical may ship to browsers
```

If you changed an edge function, also run the live suite against the Deno
runtime (setup in [`docs/CI_CD.md`](docs/CI_CD.md#3-running-a-job-locally)):

```bash
npx supabase functions serve --env-file <file with the test-only RAZORPAY_* values>
npm run test:edge                       # 14 tests
```

`npm run build` runs `tsc -b` first, so a type error fails the build rather than
shipping.

Work lands directly on `main`. CI runs all of this on every push to `main` in six jobs — static checks,
security, Deno check, integration, live edge functions, end-to-end — described
in [`docs/CI_CD.md`](docs/CI_CD.md). Locally the integration suites skip when
Supabase is not running; with `OCASIO_REQUIRE_SUPABASE=1` (always set in CI)
they fail instead. A green local run without the stack proves nothing.

Never make CI green by weakening a check: no `continue-on-error` on a gate, no
new entries in `.gitleaks.toml` for something that is a real secret, no skipped
test without a stated reason in the test itself.

## Rules that are not negotiable

These are what the project is actually about. A change that breaks one of them
will not be merged even if the tests pass.

1. **The client supplies intent, never facts.** A request may name a service, a
   date, a rating. It may not carry a customer id, a vendor id, a price or a
   status — those are derived server-side.
2. **Never weaken RLS to make something render.** If the UI cannot get data, the
   fix is the query or the policy, not disabling the policy.
3. **No table holding money or trust gets an INSERT, UPDATE or DELETE policy.**
   Writes go through a `SECURITY DEFINER` function that re-derives authorization
   from `auth.uid()`. `tests/security-hardening.test.ts` enforces this for every
   future migration too.
4. **Never claim functionality that does not exist.** No fabricated metrics,
   testimonials, transaction counts or review data. If a surface is not backed by
   real data, say so in the UI.
5. **The service-role key never reaches the browser.** It is never `VITE_`-prefixed
   and never appears in `src/`.

## Testing expectations

Authorization tests run against **real Postgres**. Mocking Supabase proves
nothing about RLS.

Assert on **state**, not on whether an error came back. With no UPDATE policy a
malicious update silently matches zero rows and returns success — a test
asserting "no error" passes while proving nothing. Assert that the row is
unchanged.

When adding a security rule, **mutation-test it**: deliberately weaken the rule,
confirm a test fails, then revert. If nothing fails, the test is decorative.
Verify the mutation actually applied — a mutation that silently changes nothing
looks exactly like a test gap.

**`fill()` is not typing.** Playwright's `fill()` sets a whole value in one
event, so it cannot see a field that loses focus between keystrokes — the vendor
application form shipped that way. Where focus matters, type key by key
(`page.keyboard.type`) and assert the value and the focus. Never define a
component inside another component's body: it remounts on every render.

**Concurrency claims need concurrent transactions.** Firing two HTTP requests at
once does not prove a lock works — the requests usually serialise anyway. Hold
the first transaction open with `pg` and show the second waiting on the lock
(`tests/booking-capacity.test.ts` is the pattern).

## Database changes

Every change is a migration in `supabase/migrations/`. Nothing is created by
hand in a dashboard. Migrations are append-only once pushed. Verify with
`npm run db:reset && npx supabase db lint --local --fail-on warning && npm test`.

Every new function pins its `search_path`, and every new `SECURITY DEFINER`
function revokes `EXECUTE` from `public` and `anon` unless anonymous callers
genuinely need it — the invariant tests fail otherwise.

## Demo data

`supabase/seed.sql` is generated from `src/utils/dataGenerator.ts`; never edit
it by hand. After changing the generator, run `npm run db:seed:generate`.
`tests/seed-data.test.ts` fails if the two disagree, if a vendor is named after
a real brand, or if a phone number, email or website could belong to someone
real (`+91 00000 …`, `.example` domains only).

## Commits

Conventional-ish prefixes: `feat:`, `fix:`, `design:`, `perf:`, `test:`,
`docs:`, `chore:`, `ci:`, `security:`. Explain *why* in the body, not just what —
the diff already says what.

## UI changes

Use the primitives in `src/components/ui` rather than hand-rolling a button or
card. Use the semantic tokens (`ink`, `muted`, `line`, `brand-600`) rather than
raw palette values.

Every async surface needs loading, empty and error states. A failed request must
never render as an empty one.

A new external host — images, fonts, an API, a script — is blocked by the
Content-Security-Policy in `vercel.json` until it is added there. The E2E suite
runs under that policy and will fail. See
[`docs/OCASIO_DEPLOYMENT.md`](docs/OCASIO_DEPLOYMENT.md#5-security-headers).

## Legal pages

The Terms, Privacy and Cancellation & Refund pages describe the product as it is
built. A change to booking, cancellation, payment, refund or review behaviour, or
to what personal data is stored or who can read it, updates those pages in the
same commit.

## Security issues

Report privately — see [`SECURITY.md`](SECURITY.md).
