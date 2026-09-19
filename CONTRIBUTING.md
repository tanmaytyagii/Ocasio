# Contributing to Ocasio

## Getting set up

Node 18+ and Docker are required.

```bash
npm install
npx supabase start
cp .env.local.example .env
npm run dev
```

## Before opening a pull request

```bash
npx tsc -b            # must be clean
npx eslint .          # must be clean
npm test              # 238 tests, all must pass
npm run build
npx playwright test   # 32 specs, desktop + mobile
```

`npm run build` runs `tsc -b` first, so a type error fails the build rather than
shipping.

## Rules that are not negotiable

These are what the project is actually about. A change that breaks one of them
will not be merged even if the tests pass.

1. **The client supplies intent, never facts.** A request may name a service, a
   date, a rating. It may not carry a customer id, a vendor id, a price or a
   status — those are derived server-side.
2. **Never weaken RLS to make something render.** If the UI cannot get data, the
   fix is the query or the policy, not disabling the policy.
3. **No table holding money or trust gets an INSERT or UPDATE policy.** Writes go
   through a `SECURITY DEFINER` function that re-derives authorization from
   `auth.uid()`.
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

## Database changes

Every change is a migration in `supabase/migrations/`. Nothing is created by
hand in a dashboard. Migrations are append-only once pushed. Verify with
`npm run db:reset && npm test`.

## Commits

Conventional-ish prefixes: `feat:`, `fix:`, `design:`, `perf:`, `test:`,
`docs:`, `chore:`. Explain *why* in the body, not just what — the diff already
says what.

## UI changes

Use the primitives in `src/components/ui` rather than hand-rolling a button or
card. Use the semantic tokens (`ink`, `muted`, `line`, `brand-600`) rather than
raw palette values.

Every async surface needs loading, empty and error states. A failed request must
never render as an empty one.
