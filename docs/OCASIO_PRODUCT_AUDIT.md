# Ocasio — Product Audit

**Date:** 2026-09-19
**Commit audited:** `79f5f46` (branch `main`, clean tree)
**Auditor:** Claude Opus 5
**Audience:** Engineers who will maintain and extend this codebase.

This document records what Ocasio **is today**, verified by reading every source file and
running the toolchain. Claims here are backed by commands whose output is reproduced in
[§12 Verification Log](#12-verification-log). Nothing in this document is inferred from the
README — the README describes a different product than the one in `src/`.

---

## 1. Executive Summary

Ocasio is a **well-executed front-end prototype of a vendor marketplace**, presented as a
finished product. The UI work is genuine: 10 pages, 3,475 lines of TypeScript/TSX, a
coherent purple brand system, responsive Tailwind layouts, and a plausible customer and
vendor journey.

Underneath, there is **no backend**. Supabase is wired to exactly one thing — authentication.
Every other feature is React `useState` seeded from a hardcoded array. Bookings, payments,
messages, favourites, blog posts, vendor applications and dashboard metrics all evaporate on
refresh.

Three findings are severe enough to block any public deployment:

| # | Finding | Severity |
|---|---------|----------|
| 1 | `.env` with live Supabase credentials is committed to git history | **Critical** |
| 2 | Payment forms collect card numbers and CVVs, then discard them | **Critical** |
| 3 | All three homepage "Top-Rated Vendors" cards link to vendors that do not exist | **High** |
| 4 | `Ocasio` is a broken submodule gitlink with no `.gitmodules` | **Medium** |

The gap between Ocasio-today and Ocasio-as-a-product is not more pages. It is persistence,
authorization, and truthfulness about what is implemented.

---

## 2. Current Architecture

### 2.1 Stack (as built)

| Layer | Technology | Notes |
|---|---|---|
| Build | Vite 5.4 | `build` script does **not** typecheck |
| UI | React 18.3 + TypeScript 5.5 | `strict: true`, but never enforced in CI |
| Styling | Tailwind 3.4 | Zero theme extension — all defaults |
| Routing | react-router-dom 6.22 | Nested `Routes`, no lazy loading, no 404 |
| Icons | lucide-react | Excluded from Vite `optimizeDeps` |
| Calendar | react-big-calendar 1.11 | Broken locale import (§5.2) |
| Dates | date-fns 3.6 | |
| Backend | Supabase JS 2.39 | **Auth only** |
| Tests | *none* | No runner, no test files |
| CI | *none* | No `.github/` directory |
| Migrations | *none* | No `supabase/`, `migrations/` or `db/` directory |

### 2.2 Directory shape

```
src/
├── App.tsx                  routing + ProtectedRoute
├── main.tsx                 entry
├── contexts/AuthContext.tsx Supabase session → React context
├── lib/supabase.ts          client construction (5 lines)
├── data/vendors.ts          calls generateVendorData() at module scope
├── utils/dataGenerator.ts   155 lines of Math.random() vendor fabrication
├── components/              Navbar, Hero, Footer, PopularCategories,
│                            FeaturedVendors, Chatbot
└── pages/                   Home, CategoryPage, VendorPage, SearchResults,
                             AboutUs, BecomeVendor, Blog, Profile,
                             VendorDashboard, Auth
```

### 2.3 Data flow (actual)

```
Supabase Auth ──► AuthContext ──► ProtectedRoute ──► every route incl. "/"
                                                      │
generateVendorData()  ──► vendorData (module const) ──┤
   Math.random()                                      │
                                                      ▼
                                          Pages render from local arrays
                                                      │
                                     useState mutations ──► lost on refresh
```

There is no write path to any database. No `insert`, `update`, `upsert`, `delete`, or
`from()` call exists anywhere in `src/`.

---

## 3. What Is Real vs. What Is Mocked

### 3.1 Real (works, persists)

- **Email/password signup and login** via `supabase.auth.signUp` / `signInWithPassword`.
- **Session persistence** across refresh via `getSession` + `onAuthStateChange`.
- **Sign out.**
- **Client-side routing and search-param handling.**
- **The visual design system** — layouts, cards, responsive grids, brand colours.

That is the complete list.

### 3.2 Mocked (looks real, is not)

| Feature | File | What actually happens |
|---|---|---|
| Vendor catalogue | `utils/dataGenerator.ts:119` | 40 vendors fabricated client-side with `Math.random()` |
| Featured vendors | `components/FeaturedVendors.tsx:5` | A *second*, separate hardcoded array that contradicts the first |
| Booking | `pages/VendorPage.tsx:72` | `setShowPayment(true)` — nothing recorded |
| Payment | `pages/VendorPage.tsx:77` | `setBookingConfirmed(true)` — no gateway, no record |
| Vendor payment | `pages/BecomeVendor.tsx:80` | `setShowConfirmation(true)` — no record |
| Vendor application | `pages/BecomeVendor.tsx:73` | `formData` collected, never transmitted |
| Customer↔vendor chat | `pages/VendorPage.tsx:48` | Canned reply after `setTimeout(1000)` |
| Vendor dashboard bookings | `pages/VendorDashboard.tsx:73` | Same 3 fake bookings for **every** vendor |
| Vendor dashboard revenue | `pages/VendorDashboard.tsx:117` | Hardcoded `₹2,50,000` for every vendor |
| Vendor inbox | `pages/VendorDashboard.tsx:56` | Same 2 fake messages for every vendor |
| Customer dashboard stats | `pages/Profile.tsx:41` | Hardcoded counts |
| Calendars | `Profile.tsx:26`, `VendorDashboard.tsx:26` | 2 hardcoded events each, March 2025 |
| Blog | `pages/Blog.tsx:16` | Hardcoded posts; new posts lost on refresh |
| Favourites | `components/Navbar.tsx:62` | Links to `/favorites` — **route does not exist** |
| AI chatbot | `components/Chatbot.tsx:35` | 7 × `input.includes()` string matches |

### 3.3 Survives refresh

**Only the auth session.** Everything in §3.2 resets.

---

## 4. Security Risks

### SEC-1 — `.env` committed to git history — **Critical**

`.env` is tracked and present in two commits (`6dc2bc1` initial, `5bc089d` "Update .env").
`.gitignore` covers `*.local` but **not** `.env`. The file contains `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`.

Correct framing: the Supabase **anon key is designed to be public** — it ships in the client
bundle regardless. It is *not* a service-role key. The real exposure is conditional:

> **If Row Level Security is not enabled on every table, the anon key grants anyone on the
> internet full read/write access to your entire database.**

Because Ocasio currently has no tables, there is nothing to steal *yet*. That changes the
moment Phase 1 lands. This must be fixed before any table exists.

Removing the file in a new commit does **not** remove it from history. See
[§9 Credential Remediation](#9-credential-remediation) for the full procedure.

### SEC-2 — Raw card data collected by forms that discard it — **Critical**

`pages/VendorPage.tsx:399-455` and `pages/BecomeVendor.tsx:122-190` render **Card Number**,
**Expiry Date**, **CVV** and **UPI ID** inputs. The inputs are uncontrolled (no `value`, no
`onChange`) and the submit handler is:

```ts
const handlePayment = (e: React.FormEvent) => {
  e.preventDefault();
  setBookingConfirmed(true);   // or setShowConfirmation(true)
};
```

The UI then displays *"Booking Confirmed! You will receive a confirmation email shortly"* and
*"Amount: ₹2,499"*. No gateway is called, no email is sent, no record is created, no money moves.

Two distinct problems:

1. **Safety.** A visitor who types a real card number into a public deployment has entered
   PCI-scope data into a page with no TLS-pinned processor, no tokenisation, and no policy.
   Nothing malicious is done with it today — but the form is indistinguishable from one that
   would be, and browser autofill/password managers may retain it.
2. **Truthfulness.** The UI asserts a completed financial transaction that did not occur.

### SEC-3 — Client-side route guards presented as authorization — **High**

`App.tsx:19-34` gates `/vendor/dashboard/*` on `user.user_metadata?.user_type !== 'vendor'`.
`user_metadata` is **user-writable** in Supabase — a user can call `supabase.auth.updateUser`
and set `user_type: 'vendor'` themselves. Role must live in a database table protected by RLS,
never in `user_metadata`.

Today this grants access only to fake data, so impact is low. It becomes critical in Phase 3.

### SEC-4 — 8 npm vulnerabilities (6 high) — **Medium**

`npm audit` reports high-severity advisories in `ws` (uninitialised memory disclosure,
memory-exhaustion DoS) and `lodash-es`, reached transitively through `react-big-calendar`.

### SEC-5 — No RLS strategy exists — **Deferred, blocking Phase 1**

There are no tables and no migrations, so there is nothing to secure yet. Recorded here so it
cannot be forgotten: **every** table created in Phase 1 needs RLS enabled and policies written
in the same migration that creates it.

---

## 5. Major Bugs

### BUG-1 — Every homepage "Top-Rated Vendors" card is a dead link — **High**

`utils/dataGenerator.ts:121-122` uses a single `id` counter that is **never reset per
category**:

```ts
let id = 1;
Object.entries(categories).forEach(([category, data]) => {
  data.names.forEach((name, index) => {
    vendors.push({ id: `${category}-${id}`, ... });
    id++;
  });
});
```

Generated IDs are therefore:

```
venues-1 … venues-10
catering-11 … catering-20
photography-21 … photography-30
decoration-31 … decoration-40
```

`components/FeaturedVendors.tsx` links to `catering-1`, `decoration-1` and `photography-1`.
**None of these exist.** All three cards on the landing page render "Vendor not found".

Verified by executing the generator — see §12.

### BUG-2 — Vendor data mutates on every page load — **High**

`data/vendors.ts:3` calls `generateVendorData()` at module scope. Ratings, review counts,
cities, prices, phone numbers and event types are all `Math.random()`. A vendor shown as
*4.7★, Mumbai, from ₹340,000* becomes *4.2★, Goa, from ₹89,000* after a refresh.

Compounded by **BUG-3**: `CategoryPage.tsx:40` and `SearchResults.tsx:61` use raw
`<a href="/vendor/...">` instead of `<Link>`. Clicking a card triggers a **full page reload**,
which re-runs the generator — so the vendor you land on is provably not the one you clicked.

### BUG-3 — Full page reloads for internal navigation — **Medium**

`CategoryPage.tsx:40`, `SearchResults.tsx:61` — `<a href>` where `<Link>` is required.
Destroys SPA state and triggers BUG-2.

### BUG-4 — Homepage vendor data contradicts vendor detail pages — **Medium**

`FeaturedVendors.tsx` hardcodes *Royal Caterers, 4.8★, 156 reviews, Mumbai*. The generator
independently invents different values for the same business name. Two sources of truth for
one entity.

### BUG-5 — `date-fns` locale imported incorrectly — **Medium**

`Profile.tsx:9` and `VendorDashboard.tsx:12`:

```ts
import enUS from 'date-fns/locale/en-US';   // ✗ no default export
```

`node_modules/date-fns/locale/en-US.js` exports only a **named** `enUS`. TypeScript reports
`TS2613`. Both calendars are constructed with an invalid locale object.

### BUG-6 — Dead routes — **Medium**

| Link | Source | Route defined? |
|---|---|---|
| `/favorites` | `Navbar.tsx:62` | ✗ blank page |
| `/contact` | `Footer.tsx:20` | ✗ blank page |

There is also **no `path="*"` fallback**, so unknown URLs render an empty `<main>` rather than
a 404.

### BUG-7 — Login role toggle contradicts real role — **Medium**

`Auth.tsx:26` redirects on the *form toggle*:

```ts
navigate(userType === 'vendor' ? '/vendor/dashboard' : '/');
```

`ProtectedRoute` then checks `user_metadata.user_type`, set at **signup**. A customer who
selects "Vendor" at login is sent to `/vendor/dashboard` and instantly bounced to `/` with no
explanation. The role selector should not exist on the login tab at all.

### BUG-8 — Client-generated IDs collide — **Low**

`VendorPage.tsx:53,63` and `VendorDashboard.tsx:128` use `messages.length + 1`. When the
canned vendor reply lands 1s later, both messages can receive the same ID → duplicate React
keys → render anomalies.

### BUG-9 — Mobile navigation does not exist — **High (UX)**

`Navbar.tsx:40` renders a hamburger icon with **no `onClick`**:

```tsx
<Menu className="h-6 w-6 md:hidden cursor-pointer" />
```

The nav links are `hidden md:flex`. On phones, category navigation is completely unreachable.

### BUG-10 — Entire site is behind authentication — **High (product)**

`App.tsx:52-56` wraps `path="/*"` — including `/`, `/about`, `/blog` and all vendor pages — in
`ProtectedRoute`. A first-time visitor sees only a login wall.

For a marketplace this is fatal: no SEO, no organic discovery, no ability to evaluate the
product before signing up, and no shareable vendor links.

### BUG-12 — Broken submodule gitlink — **Medium**

What looks like an empty directory named `Ocasio/` is actually a **gitlink**: git
tracks it with mode `160000` pointing at commit `238db8f8da0901b2a2ba5915f6166f776ab42507`.

```
$ git ls-files -s Ocasio
160000 238db8f8da0901b2a2ba5915f6166f776ab42507 0	Ocasio
```

There is **no `.gitmodules` file**, and the referenced commit does not exist in this
repository. A nested git repository was committed by accident.

Consequences:

- `git clone --recurse-submodules` produces an empty `Ocasio/` that can never be populated,
  because no URL was ever recorded.
- CI checkouts configured with `submodules: true` (a common default in GitHub Actions
  templates) will attempt to resolve it.
- `git submodule update --init` cannot succeed.

Verified by cloning the repository with `--recurse-submodules` and observing the empty,
unpopulatable directory. Removed in Phase 0.

### BUG-11 — Dead loading branch — **Trivial**

`AuthContext.tsx:34` renders `{!loading && children}`, so `ProtectedRoute`'s
`if (loading) return <div>Loading...</div>` (`App.tsx:22-24`) is unreachable.

---

## 6. Build, Type & Lint Health

### 6.1 The build lies

```jsonc
"build": "vite build"   // esbuild transpiles; it does NOT typecheck
```

`npm run build` exits **0** while `tsc -b` reports **13 errors**. The repository can claim a
green build indefinitely while type safety silently rots. `strict: true` in
`tsconfig.app.json` is currently decorative.

### 6.2 The 13 TypeScript errors

| Kind | Count | Severity |
|---|---|---|
| `TS6133` unused `React` / imports | 11 | Cosmetic (React 17+ JSX transform) |
| `TS2613` `date-fns` default import | 2 | **Real bug** (BUG-5) |

### 6.3 Lint

2 errors, 1 warning — unused `Link` (`Blog.tsx:2`), unused `Bell` (`VendorDashboard.tsx:7`),
and a `react-refresh` warning on `AuthContext.tsx:39`.

### 6.4 Bundle

```
dist/assets/index-CQIJNWal.js   575.76 kB │ gzip: 166.26 kB   ⚠ over Vite's 500 kB warning
```

Single chunk, no code splitting. `react-big-calendar` is heavy and used on only two
authenticated pages, yet ships to every visitor.

---

## 7. Database Architecture

**There is none.** No `supabase/`, `migrations/` or `db/` directory. No SQL in the repository.
No table is ever queried — `grep -rn "supabase\." src/` returns 5 hits, all `supabase.auth.*`.

Everything in §3.2 needs a schema. See the roadmap for the proposed design.

---

## 8. Other Architecture Gaps

### 8.1 Search

`SearchResults.tsx:13` — `Array.filter` + `String.includes` over 40 client-side objects.
No pagination, no sorting control (hardcoded rating desc), no price/rating/availability
filters, no typo tolerance, no empty state, no loading state, no error state.

### 8.2 AI

`Chatbot.tsx:35-70` is a 7-branch `if (input.includes(...))` chain. The README credits the
author with *"AI Integration."* It cannot read the vendor catalogue, cannot filter by price or
city, and returns the same 8 canned strings forever.

### 8.3 UX states

No error boundaries anywhere. No skeletons. The only loading indicator in the product is
`<div>Loading...</div>` at `App.tsx:23`, which is unreachable (BUG-11). Every list renders
synchronously from a local array today; each one needs loading/empty/error states once data
is real.

### 8.4 Accessibility

- **0** `aria-*` attributes in the entire codebase.
- Modals (`VendorPage` booking/payment, `Chatbot`) have no focus trap, no `Escape` handler,
  no `role="dialog"`, no focus restoration.
- The profile dropdown (`Navbar.tsx:66-100`) opens on click but is not keyboard-navigable and
  has no `aria-expanded`.
- Mobile nav unreachable (BUG-9).
- `Navbar.tsx:79` — `className="block ... flex"`, conflicting display utilities.
- Positive: all 9 `<img>` tags do have `alt` text.

### 8.5 SEO

Static `<title>` of *"Create Occasio Event Vendors Website"*. No meta description, no Open
Graph tags, no canonical URLs, no `robots.txt`, no sitemap, default Vite favicon — and the
entire site is behind auth anyway (BUG-10), so nothing is crawlable.

### 8.6 Images

9 Unsplash URLs hotlinked at full resolution. No `loading="lazy"`, no `srcset`, no CDN, no
local assets. The hero image is fetched at `w=2000`. Several generator entries duplicate the
same photo 6× within one category.

---

## 9. Credential Remediation

Deleting `.env` in a new commit is **not sufficient** — the values remain in `6dc2bc1` and
`5bc089d` and in every clone and fork.

**Required sequence:**

1. **Rotate first, scrub second.** In the Supabase dashboard → *Project Settings → API →*
   roll the anon key. Assume the committed key is public forever.
2. **Enable RLS** on every table before Phase 1 ships (there are none today).
3. **Untrack and ignore** — done in Phase 0.
4. **Purge history** (destructive, rewrites SHAs, coordinate with collaborators):

   ```bash
   pipx install git-filter-repo
   git filter-repo --invert-paths --path .env --force
   git remote add origin https://github.com/tanmaytyagii/Ocasio.git
   git push --force --all && git push --force --tags
   ```

   Every collaborator must then re-clone. Forks and GitHub's cached views may retain the blob;
   contact GitHub Support to purge cached views if needed.
5. **Verify:** `git log --all --full-history -- .env` returns nothing.

> **Phase 0 performs steps 3 only.** Steps 1, 2, 4 and 5 require the repository owner's
> decision and credentials, and step 4 rewrites shared history. They are documented, not
> executed.

---

## 10. Technical Debt Register

| ID | Item | Effort |
|---|---|---|
| TD-1 | `package.json` still named `vite-react-typescript-starter`, version `0.0.0` | XS |
| TD-2 | Broken submodule gitlink `Ocasio` — see BUG-12 | XS |
| TD-3 | Brand split: README says "Ocasio", all 8 UI files say "Occasio" | XS |
| TD-4 | `.tsbuildinfo` artefacts not gitignored | XS |
| TD-5 | `.bolt/` scaffolding from the original generator still present | XS |
| TD-6 | README claims 6 features that do not exist | S |
| TD-7 | Vendor card markup duplicated across 3 files | S |
| TD-8 | Two calendar localizer setups duplicated verbatim | S |
| TD-9 | No `Vendor` type exported — interface is private to the generator | S |
| TD-10 | `caniuse-lite` outdated | XS |

### TD-6 detail — README vs. reality

| README claim | Reality |
|---|---|
| "Multi-Event Management" | No event entity exists |
| "Task & Workflow Organization" | No task entity exists |
| "Smart Scheduling System" | Two hardcoded calendar entries |
| "Workload Optimization" | Not implemented |
| "Centralized Dashboard" | Renders hardcoded numbers |
| "Backend Development, AI Integration" | Auth only; chatbot is `String.includes` |

The README also describes an **event-planning tool**; the code is a **vendor marketplace**.

---

## 11. Recommended Implementation Order

Rationale for sequencing:

1. **Phase 0 — Safety & Truth.** Stop the bleeding: credentials, card fields, a build that
   actually typechecks, and vendor data that stops lying. Nothing here needs a database, so it
   ships today and makes every later phase verifiable.
2. **Phase 1 — Foundation.** Schema, RLS, deterministic seed, real roles, public/private route
   split. Everything else depends on this.
3. **Phase 2 — Marketplace.** Vendors, services, search, filters, favourites — reading real data.
4. **Phase 3 — Transactions.** Booking lifecycle, availability, both dashboards, messaging — writing real data.
5. **Phase 4 — Trust & Money.** Reviews gated on completed bookings; payments with webhook verification.
6. **Phase 5 — AI.** Tool-calling discovery over the real catalogue, server-side keys.
7. **Phase 6 — Production.** Tests, CI, a11y, SEO, performance, observability.

Full detail in [`OCASIO_PRODUCT_ROADMAP.md`](./OCASIO_PRODUCT_ROADMAP.md).

---

## 12. Verification Log

Every command run during this audit, with its result.

| # | Command | Result |
|---|---|---|
| 1 | `npm install` | OK — 0 errors |
| 2 | `npx vite build` | **exit 0** — 2,421 modules, 575.76 kB bundle, >500 kB warning |
| 3 | `npx tsc -b` | **13 errors** (11 × TS6133, 2 × TS2613) |
| 4 | `npx eslint .` | **2 errors, 1 warning** |
| 5 | `npm audit --omit=dev` | **8 vulnerabilities (2 low, 6 high)** — `ws`, `lodash-es` |
| 6 | `git ls-files \| grep -i env` | `.env` — **tracked** |
| 7 | `git log --oneline -- .env` | `5bc089d`, `6dc2bc1` — **2 commits** |
| 8 | `grep -rn "supabase\." src/` | 5 hits — **all `supabase.auth.*`** |
| 9 | `grep -rn "localStorage\|fetch(\|axios" src/` | **0 hits** |
| 10 | `ls -d supabase migrations db` | **none exist** |
| 11 | `ls -d tests __tests__ e2e .github` | **none exist** |
| 12 | Executed `generateVendorData()` | IDs are `venues-1..10`, `catering-11..20`, `photography-21..30`, `decoration-31..40`; `catering-1`/`decoration-1`/`photography-1` **NOT FOUND** → BUG-1 confirmed |
| 13 | `grep -n "export" node_modules/date-fns/locale/en-US.js` | `exports.enUS` — **no default export** → BUG-5 confirmed |
| 14 | Route/link cross-reference | `/favorites`, `/contact` linked but **undefined** → BUG-6 confirmed |
| 15 | `git ls-files -s Ocasio` | mode **`160000`** (gitlink) → BUG-12 confirmed |
| 16 | `git cat-file -t 238db8f8…` | **commit not present in repository** |
| 17 | `git clone --recurse-submodules .` | reproduces empty, unpopulatable `Ocasio/` |

### Build output (command 2)

```
✓ 2421 modules transformed.
dist/index.html                    0.48 kB │ gzip:   0.31 kB
dist/assets/index-Dr_q2RdB.css    33.23 kB │ gzip:   6.79 kB
dist/assets/index-CQIJNWal.js    575.76 kB │ gzip: 166.26 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 1.27s
```

### Typecheck output (command 3)

```
src/components/FeaturedVendors.tsx(1,1):  TS6133: 'React' is declared but its value is never read.
src/components/Footer.tsx(1,1):           TS6133: 'React' is declared but its value is never read.
src/components/PopularCategories.tsx(1,1):TS6133: 'React' is declared but its value is never read.
src/pages/AboutUs.tsx(1,1):               TS6133: 'React' is declared but its value is never read.
src/pages/Blog.tsx(2,1):                  TS6133: 'Link' is declared but its value is never read.
src/pages/CategoryPage.tsx(1,1):          TS6133: 'React' is declared but its value is never read.
src/pages/Home.tsx(1,1):                  TS6133: 'React' is declared but its value is never read.
src/pages/Profile.tsx(1,8):               TS6133: 'React' is declared but its value is never read.
src/pages/Profile.tsx(9,8):               TS2613: Module 'date-fns/locale/en-US' has no default export.
src/pages/SearchResults.tsx(1,1):         TS6133: 'React' is declared but its value is never read.
src/pages/VendorDashboard.tsx(7,29):      TS6133: 'Bell' is declared but its value is never read.
src/pages/VendorDashboard.tsx(12,8):      TS2613: Module 'date-fns/locale/en-US' has no default export.
```
