# Ocasio — Database Architecture

**Audience:** Engineers working on Ocasio's data layer.
**Status:** Phase 1. Describes what exists, not what is planned.

---

## 1. Principles

1. **The database is the security boundary.** React route guards are UX. A user
   who bypassed every guard still reads and writes nothing they do not own,
   because Row Level Security is enforced inside Postgres.
2. **`profiles.role` is the only authorization role.** `auth.users.raw_user_meta_data`
   is writable by the user via `supabase.auth.updateUser()` and is never trusted.
3. **RLS ships with the table.** Tables are created with RLS enabled and zero
   policies — deny-all — so no table is ever reachable before its policies exist.
4. **Reproducible from source control.** `supabase db reset` rebuilds the entire
   database from `migrations/` + `seed.sql`. Nothing is created by hand in a dashboard.
5. **Money is integer rupees.** Never floating point.

---

## 2. Tables

| Table | Purpose | Public? |
|---|---|---|
| `profiles` | One row per auth user. Holds the authorization role. | No — owner only |
| `vendors` | Vendor businesses. | Yes, when `status = 'active'` |
| `vendor_services` | Services a vendor offers. | Yes, for active vendors |
| `vendor_media` | Portfolio images. | Yes, for active vendors |
| `favorites` | Customer shortlist. | No — owner only |

### Relationships

```
auth.users
    │ 1:1  (on delete cascade)
    ▼
profiles ──────────────┐
  id, full_name        │ role: customer | vendor | admin
  avatar_url, role     │ ← authorization source of truth
    │ 1:0..1           │
    ▼                  │
vendors                │         favorites
  owner_id ────────────┘           user_id ──────► profiles.id
  slug (unique)                    vendor_id ────► vendors.id
  status: pending|active|suspended  UNIQUE (user_id, vendor_id)
  rating, review_count  ← derived, not user-writable
  starting_price        ← integer rupees
    │ 1:N         │ 1:N
    ▼             ▼
vendor_services  vendor_media
```

### Enums

```sql
user_role     : 'customer' | 'vendor' | 'admin'
vendor_status : 'pending'  | 'active' | 'suspended'
```

`admin` exists in the type so it does not need altering later. **No admin
functionality is exposed in Phase 1.**

### Indexes

`profiles(role)` · `vendors(owner_id)` · `vendors(slug)` unique ·
`vendors(category)`, `vendors(location)`, `vendors(rating desc)` — all partial on
`status='active'` · `vendors(business_name)` GIN trigram, for Phase 2 search ·
`vendor_services(vendor_id)` · `vendor_media(vendor_id, sort_order)` ·
`favorites(user_id)`, `favorites(vendor_id)`.

---

## 3. Authorization model

### Roles

| Role | Granted by | Can |
|---|---|---|
| `customer` | Signup, always | Browse, favourite, manage own profile |
| `vendor` | Admin approval only (`service_role`) | Everything a customer can, plus the vendor workspace |
| `admin` | Not issued in Phase 1 | — |

**Ownership, not role, authorises vendor management.** A `vendors` row is managed
by whoever `owner_id` points at. This lets a pending applicant manage their own
listing without holding the vendor role, and keeps role changes rare and reviewed.

### Why not `user_metadata`

Phase 0's `ProtectedRoute` read `user.user_metadata.user_type`. Any user could run:

```js
await supabase.auth.updateUser({ data: { user_type: 'vendor' } });
```

and grant themselves vendor access. That write still succeeds today — it is the
user's own metadata — but it now confers **nothing**. There is a test for exactly
this (`tests/rls-authorization.test.ts`).

### Guard functions

| Function | Purpose |
|---|---|
| `handle_new_user()` | Trigger on `auth.users`. Creates a profile with `role='customer'`, **ignoring any role in signup metadata**. Idempotent via `on conflict do nothing`. |
| `prevent_role_self_change()` | Rejects any role change made by a statement carrying an end-user identity. |
| `protect_vendor_moderated_fields()` | Rejects a vendor changing their own `status`, `rating`, `review_count` or `owner_id`. |
| `request_vendor_onboarding(...)` | The **only** insert path into `vendors`. Always produces `status='pending'`. Never touches `profiles.role`. Generates a unique slug. |

#### The `auth.uid()` test, and why not `auth.role()`

Both guards ask *"does this statement carry an end-user identity?"*:

```sql
if (select auth.uid()) is not null then
  raise exception ...
end if;
```

A PostgREST request with a user JWT has a non-null `auth.uid()`. Server-side
contexts — `service_role`, migrations, seeds, `psql` — do not.

These guards were originally written as `auth.role() <> 'service_role'`. On a
direct connection `auth.role()` is **NULL**, and `NULL <> 'service_role'`
evaluates to NULL rather than true, so the guard silently permitted the change.
Testing `auth.uid()` is explicit and has no three-valued-logic trap.

### Avoiding RLS recursion

A policy on `profiles` that selects from `profiles` recurses infinitely. Every
cross-table check therefore goes through a `SECURITY DEFINER` helper, which runs
outside RLS and terminates:

| Helper | Used by |
|---|---|
| `is_active_vendor(uuid)` | Public read policies on `vendor_services`, `vendor_media` |
| `owns_vendor(uuid)` | Owner policies on `vendor_services`, `vendor_media` |
| `current_user_role()` | Reads the caller's role without recursion |

Each is a single boolean over one indexed key, executes **no dynamic SQL**, takes
no user-supplied SQL text, and pins `search_path = ''` so a hostile schema cannot
shadow the referenced tables. `execute` is revoked from `public` and granted only
to the roles that need it.

> **Note:** pinning `search_path = ''` means extension types are not resolvable
> inside these functions. `request_vendor_onboarding` compares `slug::text`
> rather than using `citext`, because `citext`'s operators live in the
> `extensions` schema and are not on the path.

---

## 4. Policy matrix

| Table | anon | authenticated (not owner) | owner |
|---|---|---|---|
| `profiles` | — | — | select, update (not `role`) |
| `vendors` | select `status='active'` | select `status='active'` | + select, update own |
| `vendor_services` | select for active vendors | select for active vendors | + full CRUD on own |
| `vendor_media` | select for active vendors | select for active vendors | + full CRUD on own |
| `favorites` | — | — | select, insert, delete own |

Deliberate omissions:

- **No INSERT policy on `vendors`** — a client cannot create one directly with
  `status='active'`. Use `request_vendor_onboarding()`.
- **No DELETE policy on `vendors` or `profiles`** — removal is a moderation
  action; profiles cascade from `auth.users`.
- **No UPDATE policy on `favorites`** — a favourite is created or removed, never edited.
- **`profiles` is never world-readable.** Public vendor information lives in
  `vendors`, so there is no reason to expose profiles at all.

---

## 5. Migrations

```
supabase/
├── config.toml
├── migrations/
│   ├── 20260919000001_initial_schema.sql   tables, enums, constraints, indexes, RLS on
│   └── 20260919000002_roles_and_rls.sql    helpers, triggers, onboarding, policies
└── seed.sql                                 deterministic demo data (generated)
```

Migrations are append-only once shared. Rebuild from scratch with:

```bash
npx supabase db reset
```

---

## 6. Seed strategy

`supabase/seed.sql` is **generated** by `scripts/generate-seed.ts` and the output
is committed, so the database is reproducible from source control alone.

```bash
npm run db:seed:generate    # regenerate after changing the demo catalogue
```

### This is DEMO DATA

40 vendors, 320 services, 40 media rows. **These are not real businesses.**
Names, ratings, review counts, prices, phone numbers and emails are fabricated.
Every demo vendor is owned by a profile named `Ocasio Demo Vendor` and uses an
`@ocasio.test` email, so demo rows can be identified and purged before real
vendors onboard:

```sql
delete from auth.users
where id in (select id from public.profiles where full_name = 'Ocasio Demo Vendor');
```

Values are byte-identical to the Phase 0 client catalogue, so migrating
discovery to the database changed no visible content. No `Math.random()` is
involved: ids derive from a SHA-1 of a stable key, and the catalogue itself is
seeded.

Seeded vendors carry `role='vendor'` and `status='active'` because they
represent already-approved businesses. A real signup cannot reach that state —
the seed can only do it because it runs with no end-user identity attached.

---

## 7. Local development

Requires **Docker**.

```bash
npx supabase start            # starts Postgres, Auth, PostgREST, Studio
cp .env.local.example .env    # point the app at the local stack
npm run dev
```

| Service | URL |
|---|---|
| API | http://127.0.0.1:54321 |
| Studio | http://127.0.0.1:54323 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Mailpit | http://127.0.0.1:54324 |

```bash
npx supabase stop             # tear down
npm run db:reset              # rebuild from migrations + seed
npm run db:types              # regenerate TypeScript types from the live schema
```

The local anon/service keys are Supabase's published development keys: identical
on every machine, reaching only a throwaway container on 127.0.0.1. They are
**not secrets**.

### Deploying the schema to a hosted project

```bash
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

> Do **not** run `seed.sql` against a production project. It creates 40 fake
> businesses and 40 auth users.

---

## 8. Testing

Authorization tests are **integration tests against a real Postgres**. Mocking
Supabase would prove nothing, because RLS is the only thing enforcing
authorization.

```bash
npx supabase start
npm run test
```

31 tests: 24 authorization boundaries, 7 public marketplace reads. They skip with
a clear reason when the stack is not running rather than passing vacuously.

The suite is mutation-tested: adding a world-readable policy on `profiles` fails
exactly 3 tests, and removing it restores 31 passing. A suite that cannot fail
proves nothing.

---

## 9. Deferred, and why

| Table | Phase | Reason |
|---|---|---|
| `bookings`, `booking_items`, `booking_status_history` | 3 | Needs the lifecycle and server-side pricing designed first |
| `conversations`, `conversation_participants`, `messages` | 3 | — |
| `reviews` | 4 | Must be gated on a completed booking, which does not exist yet |
| `payments` | 4 | Needs a provider and webhook verification |
| `notifications` | 4 | — |
| `events` | — | **See below** |

### Why there is no `events` table

The Phase 1 brief lists `events` as optional, *"If the current product does not
have enough real event functionality to justify this table, document that
decision and defer it."*

It does not. The product has no event creation, no event management and no event
entity anywhere in `src/`. The only event-shaped things are two hardcoded
calendar entries in `Profile.tsx` and two in `VendorDashboard.tsx`, dated March
2025. The README describes event planning, but the code is a vendor marketplace.

Creating `events` now would be schema invented ahead of a feature, and it would
be designed without knowing what an Ocasio event actually contains. It is
deferred until the product decides whether Ocasio plans events or brokers
vendors. `bookings` already carries `event_date` and `guest_count`, which covers
the marketplace use case without a separate entity.

---

## 10. Future direction

- **Phase 2** — `tsvector` + GIN full-text search on vendors; the `pg_trgm`
  index is already in place. Keyset pagination.
- **Phase 3** — booking lifecycle with transitions enforced by a `SECURITY
  DEFINER` function and a status-history trigger. Availability with a DB-level
  double-booking constraint.
- **Phase 4** — `reviews` gated on completed bookings; a trigger maintaining
  `vendors.rating` / `review_count`, which are already non-user-writable.
  `payments` with `UNIQUE (provider, provider_order_id)` for webhook idempotency.
- **Phase 6** — replace hand-written `src/types/database.ts` with generated types.
