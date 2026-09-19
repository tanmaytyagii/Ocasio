# Ocasio — Product Roadmap

**Companion to:** [`OCASIO_PRODUCT_AUDIT.md`](./OCASIO_PRODUCT_AUDIT.md)
**Audience:** Engineers implementing these phases.

The standard this roadmap builds toward:

> *This behaves like a real product, survives refresh, protects user data, has real
> workflows, and can be maintained by another engineer.*

## Principles

1. **Every phase ends buildable.** `tsc && eslint && test && build` must pass before a phase closes.
2. **Preserve the existing UI.** Upgrade components in place; do not re-theme, do not swap design systems.
3. **Never claim more than is built.** README and UI copy track reality.
4. **RLS in the same migration as the table.** No table ships unprotected.
5. **The frontend is never the source of truth** for price, role, or booking status.

---

## Phase 0 — Safety & Truth ✅ **Complete**

**Goal:** make the repository safe to publish and its build honest. No database required.

| ID | Task | Fixes |
|---|---|---|
| 0.1 | Untrack `.env`, ignore it, add `.env.example`, document rotation + history purge | SEC-1 |
| 0.2 | Remove card/CVV/UPI fields; replace with a labelled mock checkout | SEC-2 |
| 0.3 | `build` runs `tsc -b`; fix all 13 type errors incl. `date-fns` | §6.1, BUG-5 |
| 0.4 | Deterministic vendor data (seeded PRNG); fix the ID counter | BUG-1, BUG-2, BUG-4 |
| 0.5 | `<a href>` → `<Link>` for internal navigation | BUG-3 |
| 0.6 | Brand spelling → **Ocasio**; fix `package.json` name; drop empty `Ocasio/`, ignore `.tsbuildinfo` | TD-1..4 |
| 0.7 | These two documents | — |

**Explicitly deferred from Phase 0:** key rotation and `git filter-repo` history rewrite —
both need the owner's credentials and rewrite shared history (audit §9).

**Exit criteria:** `tsc` clean · `eslint` clean · `build` passes · no card inputs · no secrets
tracked · vendor identical across two refreshes · every homepage card resolves.

---

## Phase 1 — Foundation ✅ **Complete**

**Goal:** a real database with real roles, and a marketplace the public can see.

### 1.1 Schema

Normalised design — deliberately **fewer** tables than the brief's candidate list, because
several (`vendor_categories`, `vendor_locations`) are attributes, not entities, at this scale.
They can be extracted later if a vendor genuinely needs many of each.

```
auth.users (Supabase)
    │ 1:1
    ▼
profiles ──────────────────────────┐
  id uuid PK → auth.users.id       │ role: 'customer' | 'vendor' | 'admin'
  full_name, phone, avatar_url     │ ← TRUSTED role source, replaces user_metadata
  created_at, updated_at           │
    │ 1:0..1                       │
    ▼                              │
vendors                            │
  id uuid PK                       │
  owner_id → profiles.id           │
  slug citext UNIQUE  ← stable public URL
  business_name, description, city, category
  status: 'draft'|'pending'|'approved'|'suspended'
  rating_avg numeric, rating_count int   ← denormalised, trigger-maintained
    │ 1:N            │ 1:N
    ▼                ▼
vendor_services   vendor_media
  vendor_id         vendor_id
  name              url, kind, sort_order
  description
  price_min, price_max int   ← paise/rupees, integer only
  duration_minutes

vendor_availability
  vendor_id, date, is_available
  UNIQUE (vendor_id, date)

bookings
  id uuid PK
  customer_id → profiles.id
  vendor_id → vendors.id
  service_id → vendor_services.id
  event_date, guest_count, notes
  status: booking_status enum
  quoted_price int   ← set server-side from vendor_services, NEVER from client
    │ 1:N
    ▼
booking_status_history
  booking_id, from_status, to_status, changed_by, reason, created_at

payments
  booking_id, provider, provider_order_id, provider_payment_id
  amount int, currency, status, raw_payload jsonb
  UNIQUE (provider, provider_order_id)   ← idempotency

reviews
  booking_id UNIQUE  ← one review per booking, enforced by constraint
  vendor_id, customer_id, rating 1..5, body

favorites
  customer_id, vendor_id
  UNIQUE (customer_id, vendor_id)

conversations ──┬── conversation_participants (conversation_id, profile_id)
                └── messages (conversation_id, sender_id, body, read_at)
```

Every table: `uuid` PK via `gen_random_uuid()`, `created_at`, `updated_at` where mutable,
FK constraints, and indexes on every FK plus `vendors(city, category)`, `bookings(vendor_id, status)`.

### 1.2 Booking status enum

```sql
CREATE TYPE booking_status AS ENUM (
  'requested','accepted','rejected','payment_pending',
  'confirmed','in_progress','completed','cancelled','refunded'
);
```

### 1.3 RLS policy matrix

| Table | Public read | Customer | Vendor |
|---|---|---|---|
| `profiles` | ✗ | own row | own row |
| `vendors` | ✓ where `status='approved'` | read | write own |
| `vendor_services` / `vendor_media` | ✓ for approved vendors | read | write own |
| `bookings` | ✗ | own (`customer_id = auth.uid()`) | own vendor's |
| `payments` | ✗ | own booking, read-only | own booking, read-only |
| `reviews` | ✓ | insert only where a **completed** booking exists | read |
| `favorites` | ✗ | own only | ✗ |
| `messages` | ✗ | participant only | participant only |

Status transitions and `quoted_price` are enforced by a `SECURITY DEFINER` function plus a
trigger — **never** by a client-side `update`.

### 1.4 Roles

Migrate role out of `user_metadata` (user-writable, SEC-3) into `profiles.role`, populated by
an `on_auth_user_created` trigger. `ProtectedRoute` reads `profiles`, not the JWT metadata.

### 1.5 Public/private split

```
PUBLIC   /  /vendors  /vendors/:slug  /category/:slug  /search  /about  /contact  /blog  /auth
PRIVATE  /dashboard  /favorites  /bookings  /messages  /vendor/dashboard
```

Fixes BUG-10 and BUG-6. Adds a real 404.

### 1.6 Deterministic seed

`supabase/seed.sql` — the Phase 0 seeded catalogue promoted to SQL with fixed UUIDs, so local,
CI and preview environments are byte-identical.

**Exit criteria — all met:**

| Criterion | Evidence |
|---|---|
| Migrations apply from empty | `supabase db reset` rebuilds both migrations + seed |
| RLS proven by test | 24 authorization tests; mutation-tested to confirm they can fail |
| Seed is idempotent | `on conflict do nothing` throughout |
| Homepage renders from Postgres | Verified with the anon key against the local stack |
| Site browsable logged out | Public route split; 7 public-marketplace tests |

**Delivered beyond the plan:** favourites persisted end to end (table, RLS,
service, page), working mobile navigation, a 404 route, and per-route titles and
meta descriptions.

**Deviations from the original plan, with reasons:**

- **No `events` table.** The product has no event functionality to model. See
  `OCASIO_DATABASE.md` §9.
- **Types are hand-written, not generated.** `supabase gen types` needs a running
  stack; committing generated types would make the build depend on infrastructure
  contributors may not have. `npm run db:types` produces them on demand.
- **Ownership, not role, authorises vendor management.** Lets a pending applicant
  manage their own listing without holding the vendor role, and keeps role
  changes rare and reviewed.
- **`/contact` link removed rather than given a placeholder page.** There is no
  contact page and no real contact details to put on one.

---

## Phase 2 — Marketplace

- Vendor listing + detail from the database, on stable slugs.
- **Search:** PostgreSQL full-text (`tsvector` + GIN) with `pg_trgm` for typo tolerance.
  Filters: category, city, price range, min rating, service. Sorting + keyset pagination.
  *Not* Typesense — 40–5,000 rows does not justify it. Revisit past ~50k rows or sub-50ms needs.
- Favourites persisted per account.
- Loading / empty / error states for every async surface; skeletons matching current card geometry.

**Exit criteria:** search returns from Postgres · filters compose · favourites survive
logout/login on another device · zero hardcoded vendor arrays remain.

---

## Phase 3 — Transactions

- Booking lifecycle with server-enforced transitions and `booking_status_history`.
- Availability calendar; double-booking prevented by a DB constraint, not UI state.
- **Vendor dashboard** on real data scoped to the logged-in vendor — replaces the identical
  fake bookings and `₹2,50,000` every vendor currently sees.
- **Customer dashboard** — bookings, favourites, conversations, payments.
- Persistent messaging with DB-generated IDs (fixes BUG-8), read state, participant-only RLS.
  Supabase Realtime on the open thread only.
- Functional vendor onboarding writing a real `vendors` row in `pending` status.

**Exit criteria:** booking survives refresh · vendor B cannot mutate vendor A's booking
(test-proven) · illegal transitions rejected by the database · messages persist.

---

## Phase 4 — Trust & Money

- Reviews gated on a `completed` booking, one per booking, rating recomputed by trigger.
- **Payments — Razorpay** (INR-native, UPI support; the existing UI already offers UPI):
  1. Server creates an order → returns `order_id`.
  2. Client opens Razorpay **hosted checkout** — raw card data never touches Ocasio.
  3. Razorpay → **webhook** → signature verified server-side → booking marked `confirmed`.
  4. Idempotency via `UNIQUE (provider, provider_order_id)`.

  > A booking is **never** marked paid from a frontend callback. The webhook is the only
  > authority. This is the direct fix for SEC-2.
- Notifications: email on booking request / acceptance / payment.

**Exit criteria:** replayed webhook does not double-credit · forged signature rejected ·
frontend callback alone cannot confirm a booking · no card data in Ocasio's database.

---

## Phase 5 — AI Discovery

Replace `Chatbot.tsx`'s `String.includes` chain with tool-calling over the real catalogue.

```
"wedding photographer in Delhi under ₹80k with drone coverage"
   │
   ▼  Claude (server-side Edge Function — API key NEVER in the client bundle)
   │  extracts → {category: photography, city: Delhi, max_price: 80000,
   │              services: [drone]}
   ▼  search_vendors() tool → the same Phase 2 Postgres query
   │
   ▼  Claude narrates ONLY the returned rows → existing vendor cards
```

Hard rule: the model may only describe vendors, prices, ratings and availability present in
the tool result. Zero results → say so and suggest relaxing a constraint. Never invent.

Model: `claude-sonnet-5` (fast, cheap enough for interactive search). Cite row IDs in the
response so hallucination is detectable in tests.

**Exit criteria:** every vendor named in a reply exists in the DB · empty results handled
honestly · no LLM key in the client bundle · hallucination regression test passes.

---

## Phase 6 — Production Hardening

- **Tests.** Vitest unit (pricing, status transitions, search params). Integration against a
  local Supabase (auth, vendor creation, booking lifecycle, RLS isolation, review gating).
  Playwright E2E: customer discover→book→pay→confirm; vendor login→accept→complete; mobile nav.
- **CI.** GitHub Actions on PR: `install → typecheck → lint → test → build`. Branch protection.
- **A11y.** Focus traps, `Escape`, keyboard dropdown, working mobile nav (BUG-9), semantic
  HTML first — not scattered `aria-*`.
- **Performance.** Route-level `React.lazy` (calendar off the public path), `srcset` +
  `loading="lazy"`, DB indexes, keyset pagination. Target: public bundle < 200 kB gzip.
- **SEO.** Per-route titles/meta, OG tags, canonical URLs, `robots.txt` disallowing dashboards,
  sitemap from approved vendors.
- **Observability.** Error tracking, structured logs on payment webhooks, uptime checks.
- **README rewrite** — *last*, describing only what exists, with Current Features and Roadmap
  strictly separated (fixes TD-6).

---

## Sequencing Summary

| Phase | Theme | Depends on | Blocking risk if skipped |
|---|---|---|---|
| 0 | Safety & truth | — | ✅ Complete |
| 1 | Foundation | 0 | ✅ Complete |
| 2 | Marketplace | 1 | No discovery |
| 3 | Transactions | 1, 2 | No product |
| 4 | Trust & money | 3 | No revenue |
| 5 | AI | 2, 3 | Differentiator only |
| 6 | Hardening | all | Cannot safely operate |

Phase 5 is the headline feature but is deliberately **last before hardening** — an AI that
queries an empty or fake database is the same `String.includes` chatbot with a larger bill.
