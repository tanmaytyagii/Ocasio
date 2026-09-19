# Ocasio — Marketplace Architecture

**Audience:** Engineers working on vendor discovery.
**Status:** Phase 2. Describes what exists, not what is planned.
**See also:** [`OCASIO_DATABASE.md`](./OCASIO_DATABASE.md) for schema and RLS.

---

## 1. One source of truth

Every vendor fact rendered anywhere in the marketplace comes from Postgres.
There is no client-side vendor catalogue, no random generation, and no
per-category hardcoded array.

`src/utils/dataGenerator.ts` still exists, but **only** as the input to
`scripts/generate-seed.ts`, which produces `supabase/seed.sql`. No page, component
or hook imports it. Confirm with:

```bash
grep -rn "dataGenerator\|data/vendors" src/pages src/components src/hooks
```

---

## 2. Search

### Why Postgres and nothing else

40 seeded vendors today; realistically thousands at launch. PostgreSQL full-text
search plus `pg_trgm` covers that comfortably with indexes already in place.
Typesense, Elasticsearch or Algolia would add an operational dependency, a sync
pipeline and a failure mode, for no measurable gain at this scale.

Revisit when result sets reach roughly **50k vendors**, or when sub-50ms latency
becomes a product requirement.

### How a match is found

`vendors.search_vector` is a **generated** `tsvector` column — generated rather
than trigger-maintained so it cannot drift from the row it describes. It is
weighted:

| Weight | Field | Effect |
|---|---|---|
| A | `business_name` | A name match outranks everything |
| B | `category` | |
| C | `location` | |
| D | `description` | A description mention ranks lowest |

`search_vendors()` treats a row as matching when **any** of these hold:

1. `search_vector @@ websearch_to_tsquery('english', q)` — full-text match
2. `business_name ILIKE '%q%'` — substring
3. `similarity(business_name, q) > 0.25` — trigram, for typos
4. A row in `vendor_services` for that vendor whose `name ILIKE '%q%'`

Rule 3 is what makes `Capture Momets` still find **Capture Moments**;
dictionary-based full-text search alone cannot do that. Rule 4 exists because a
generated column cannot reference another table, so service names are matched
with an `EXISTS` clause instead.

### How relevance is calculated

> Relevance is `ts_rank_cd(search_vector, query) + similarity(business_name, query)`.
>
> With no search term, "relevance" falls back to **rating descending**.
>
> There is no boosting, no promotion, and no paid placement. Nothing is weighted
> by anything other than text match and rating.

The homepage's "Top-rated vendors" is likewise ordered by rating, then review
count, and says so on the page.

---

## 3. Filters

All filtering happens in Postgres. Nothing fetches the catalogue and filters in
React.

| Filter | Parameter | Matching |
|---|---|---|
| Category | `p_category` | Exact |
| Location | `p_location` | Exact |
| Min price | `p_min_price` | `starting_price >= n` |
| Max price | `p_max_price` | `starting_price <= n` |
| Min rating | `p_min_rating` | `rating >= n` |
| Service | `p_service` | `EXISTS` on `vendor_services.name ILIKE` |

Filters compose: passing several narrows the set by all of them.

`filter_options()` supplies the category list, location list and real price
bounds, so the controls cannot drift from the catalogue the way a hardcoded city
list would.

---

## 4. Sorting

| Value | Order |
|---|---|
| `relevance` | Text rank when searching, else rating desc |
| `rating` | `rating` desc |
| `price_asc` | `starting_price` asc |
| `price_desc` | `starting_price` desc |
| `reviews` | `review_count` desc |

Every sort ends with `rating desc, id` as a **stable tiebreaker**. Without it,
equal-ranked rows can reorder between queries, and a vendor can appear on two
pages or on none while paginating.

---

## 5. Pagination

Offset-based, 12 per page.

Offset rather than keyset because results are ordered by user-chosen keys
(price, rating, relevance) and the catalogue is small enough that deep-offset
cost is irrelevant. Keyset pagination becomes worth its complexity at tens of
thousands of rows.

`search_vendors()` returns `total_count` from a `COUNT(*) OVER ()` window
function, so the UI gets "showing 13–24 of 40" in the **same round trip** as the
results — no second count query.

**Changing any filter resets to page 1.** This is the specific way pagination
"breaks when filters change": a narrower result set can have fewer pages than the
one you were on, stranding the user on an empty page.

---

## 6. URL query parameters

Search state lives in the URL, not in React state. That makes a result set
refreshable, shareable and navigable with browser back/forward.

```
/search?q=wedding&category=Photography&location=Delhi&maxPrice=80000&sort=rating&page=2
```

| Parameter | Type | Notes |
|---|---|---|
| `q` | string | Free-text search |
| `category` | string | Exact category name |
| `location` | string | Exact city |
| `minPrice` / `maxPrice` | integer | Rupees |
| `minRating` | number | e.g. `4.5` |
| `service` | string | Substring of a service name |
| `sort` | enum | Falls back to `relevance` if unrecognised |
| `page` | integer | 1-based; clamped to ≥ 1 |

Managed by `src/hooks/useMarketplaceParams.ts`. Unparseable values degrade to
undefined rather than throwing, so a hand-edited URL cannot break the page.

---

## 7. Query strategy

| Surface | Query | Round trips |
|---|---|---|
| `/vendors`, `/search`, `/category/:slug` | `search_vendors()` RPC | 1 (+1 for filter options, cached per mount) |
| `/vendors/:slug` | One `select` embedding `vendor_services` and `vendor_media` | 1 |
| Homepage featured | `select` ordered by rating | 1 |
| Homepage categories | `category_counts()` RPC | 1 |
| Favourites | `select` embedding vendor rows | 1 |

**No N+1.** Vendor detail fetches services and media as embedded relations in a
single request rather than a query per row. Listings do not fetch services at
all — the card does not display them.

### Data access boundary

```
component  →  src/services/*  →  supabase-js  →  Postgres
```

Components never build queries. `src/services/vendors.ts` is the only module
that talks to Supabase about vendors.

No state-management library was added. Discovery is a handful of reads with no
cache-invalidation requirements; `useAsync` and local state cover it. Revisit
when mutations and cross-page cache consistency arrive with bookings.

### Error handling

Service functions log the technical message to the console and throw a plain,
user-safe sentence (`Unable to load vendors`). Raw Supabase error text, error
codes and SQL never reach the UI.

---

## 8. Indexes

| Index | Supports |
|---|---|
| `vendors_search_vector_idx` (GIN) | Full-text search |
| `vendors_name_trgm_idx` (GIN) | Typo-tolerant name matching |
| `vendors_category_idx` ⁺ | Category filter |
| `vendors_location_idx` ⁺ | Location filter |
| `vendors_rating_idx` ⁺ | Rating filter and sort |
| `vendors_starting_price_idx` ⁺ | Price filter and sort |
| `vendors_slug_key` (unique) | Vendor detail by slug |
| `vendor_services_name_trgm_idx` (GIN) | Service search and filter |
| `vendor_services_vendor_name_idx` | Service lookups per vendor |
| `vendor_media_vendor_id_idx` | Portfolio ordering |

⁺ = partial index, `WHERE status = 'active'`. Every public query filters on
active, so the index only covers rows that can actually be returned.

---

## 9. Public data exposure

`vendors.owner_id` is an `auth.users` UUID and is **not** readable by anonymous
visitors. Migration `20260919000003` drops the table-level `SELECT` grant for
`anon` and re-grants the public columns individually.

Two consequences worth knowing before you touch this:

1. **A column-level `REVOKE` does nothing while a table-level `GRANT SELECT`
   stands.** Postgres tracks table and column privileges separately, and the
   table grant already covers every column. The grant must be dropped and the
   columns re-granted.
2. **This breaks `SELECT *` for `anon` everywhere**, including inside
   non-`SECURITY DEFINER` functions, which run with the caller's privileges.
   `search_vendors()` names its columns for this reason, and so do the services
   and the tests.

> **Maintenance:** a new column on `public.vendors` will **not** be readable by
> anonymous visitors until it is added to the grant list in migration
> `20260919000003`. New columns are private by default and must be opted in.

`search_vendors()` returns a deliberately narrow column set: no `owner_id`, no
`phone`, no `email`. Contact details belong on the vendor detail page, not in a
bulk listing.

---

## 10. Demo data

The catalogue is **demonstration data, not real businesses**. 40 vendors, 320
services, 40 portfolio images, all deterministic.

- Every demo vendor is owned by a profile named `Ocasio Demo Vendor` with an
  `@ocasio.test` email, so demo rows can be identified and purged.
- Vendor detail labels the portfolio as *"sample imagery supplied with this demo
  listing, not verified client work."*
- Ratings and review counts are seeded numbers. **No review system exists**, so
  nothing on the site claims these are verified customer reviews.
- There are no testimonials, booking counts, revenue figures or activity feeds —
  real or fabricated.

### Product language

Labels match what the product can actually do:

| Says | Because |
|---|---|
| "Request a booking (demo)" | It opens a form that does not persist |
| "Demo checkout — no payment is taken" | There is no payment provider |
| "Messaging is not connected yet" | Nothing is sent or stored |
| "Top-rated vendors… ranked by rating, then review count. No paid placement." | That is exactly the ordering |

Nothing says "Book now", "Payment complete", "Verified vendor" or "Available",
because none of those are true yet.

---

## 11. Known limitations

- Search is single-language (`english` text-search configuration). Vendor names
  and cities are Indian but indexed with the English dictionary; stemming is
  imperfect for non-English terms. Trigram matching partly compensates.
- The service filter is substring matching, not a controlled vocabulary. There is
  no `services` taxonomy table yet, so "drone" and "Drone Shots" are matched by
  `ILIKE` rather than by id.
- `filter_options()` runs on every discovery page mount and is not cached.
  Negligible at this scale; worth memoising if the catalogue grows.
- No SSR, so search pages are not crawlable by engines that do not execute
  JavaScript. Public reachability was the Phase 1 goal; prerendering is Phase 6.
- Ratings are seeded values, not derived from reviews. `vendors.rating` and
  `review_count` are already non-user-writable, and a trigger will maintain them
  once reviews exist.
