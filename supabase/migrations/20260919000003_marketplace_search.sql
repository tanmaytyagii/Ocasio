-- Ocasio — marketplace search, filtering, sorting and pagination
--
-- Phase 2. Moves discovery from client-side Array.filter into Postgres so that
-- filtering, sorting and pagination happen next to the data instead of after
-- fetching every row.
--
-- Deliberately Postgres-only: 40 seeded vendors, realistically thousands at
-- launch. Full-text search plus pg_trgm covers this comfortably. Introducing
-- Typesense/Elastic here would add an operational dependency with no benefit at
-- this scale. Revisit past roughly 50k vendors or sub-50ms latency targets.

-- ---------------------------------------------------------------------------
-- Full-text search vector
-- ---------------------------------------------------------------------------

-- A generated column stays consistent by construction: there is no trigger to
-- forget and no way for it to drift from the row it describes.
--
-- Weights drive ranking: A = business name, B = category, C = location,
-- D = description. A name match therefore outranks a description mention.
-- Service names live in another table and cannot be referenced from a generated
-- column, so search_vendors() matches those with a separate EXISTS clause.
alter table public.vendors
  add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('english', coalesce(business_name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(category, '')),      'B') ||
    setweight(to_tsvector('english', coalesce(location, '')),      'C') ||
    setweight(to_tsvector('english', coalesce(description, '')),   'D')
  ) stored;

comment on column public.vendors.search_vector is
  'Generated full-text index over name/category/location/description. Weighted A-D so name matches outrank description matches. Service names are matched separately in search_vendors().';

create index vendors_search_vector_idx on public.vendors using gin (search_vector);

-- ---------------------------------------------------------------------------
-- Indexes supporting the Phase 2 filters
-- ---------------------------------------------------------------------------

-- Partial on active: every public query filters status = 'active', so the index
-- only needs to cover rows that can actually be returned.
create index vendors_starting_price_idx on public.vendors (starting_price)
  where status = 'active';

-- Service-name search and the service filter both do substring matching.
create index vendor_services_name_trgm_idx
  on public.vendor_services using gin (name gin_trgm_ops);

create index vendor_services_vendor_name_idx
  on public.vendor_services (vendor_id, name);

-- ---------------------------------------------------------------------------
-- Stop exposing owner_id to anonymous visitors
-- ---------------------------------------------------------------------------

-- owner_id is an auth.users UUID. Nothing public needs it, and a public listing
-- should not hand out internal account identifiers.
--
-- A column-level REVOKE does nothing while a table-level GRANT SELECT stands:
-- Postgres tracks table and column privileges separately, and the table grant
-- already covers every column. The working form is to drop the table-level
-- grant and re-grant the columns individually.
--
-- MAINTENANCE: a column added to public.vendors later will NOT be readable by
-- anon until it is added to this grant list. That is the intended trade-off --
-- new columns are private by default and must be opted in. tests/marketplace
-- asserts owner_id stays hidden.
--
-- authenticated keeps full access because vendor owners read their own row.
revoke select on public.vendors from anon;
grant select (
  id, slug, business_name, description, category, location, status,
  phone, email, website, business_hours, hero_image_url,
  rating, review_count, starting_price, created_at, updated_at, search_vector
) on public.vendors to anon;

-- ---------------------------------------------------------------------------
-- search_vendors()
-- ---------------------------------------------------------------------------

-- Returns one page of results plus the total match count, so the UI gets
-- pagination context without a second round trip.
--
-- NOT security definer: this runs as the caller, so the "vendors: public read
-- active" policy still applies and inactive vendors stay invisible. Making it
-- definer would silently bypass RLS.
--
-- Columns are chosen deliberately: no owner_id, no phone, no email. Contact
-- details belong on the vendor detail page, not in a bulk listing.
create or replace function public.search_vendors(
  p_query      text    default null,
  p_category   text    default null,
  p_location   text    default null,
  p_min_price  integer default null,
  p_max_price  integer default null,
  p_min_rating numeric default null,
  p_service    text    default null,
  p_sort       text    default 'relevance',
  p_limit      integer default 12,
  p_offset     integer default 0
)
returns table (
  id             uuid,
  slug           citext,
  business_name  text,
  description    text,
  category       text,
  location       text,
  hero_image_url text,
  rating         numeric,
  review_count   integer,
  starting_price integer,
  relevance      real,
  total_count    bigint
)
language sql
stable
as $$
  with normalised as (
    select
      nullif(trim(coalesce(p_query, '')), '')   as q,
      nullif(trim(coalesce(p_service, '')), '') as svc,
      greatest(coalesce(p_limit, 12), 1)        as lim,
      greatest(coalesce(p_offset, 0), 0)        as off
  ),
  matched as (
    -- Columns are listed explicitly rather than v.*: anon holds column-level
    -- SELECT (not table-level), so v.* would demand privileges it does not
    -- have and fail with "permission denied for table vendors".
    select
      v.id, v.slug, v.business_name, v.description, v.category, v.location,
      v.hero_image_url, v.rating, v.review_count, v.starting_price,
      case
        when n.q is null then 0::real
        else ts_rank_cd(v.search_vector, websearch_to_tsquery('english', n.q))
             + similarity(v.business_name, n.q)
      end as rank
    from public.vendors v
    cross join normalised n
    where v.status = 'active'
      and (n.q is null or (
            v.search_vector @@ websearch_to_tsquery('english', n.q)
            or v.business_name ilike '%' || n.q || '%'
            -- Trigram fallback gives typo tolerance that dictionary-based
            -- full-text search cannot: "photgraphy" still finds Photography.
            or similarity(v.business_name, n.q) > 0.25
            or exists (
                 select 1 from public.vendor_services s
                 where s.vendor_id = v.id and s.name ilike '%' || n.q || '%'
               )
          ))
      and (p_category   is null or v.category = p_category)
      and (p_location   is null or v.location = p_location)
      and (p_min_price  is null or v.starting_price >= p_min_price)
      and (p_max_price  is null or v.starting_price <= p_max_price)
      and (p_min_rating is null or v.rating >= p_min_rating)
      and (n.svc is null or exists (
             select 1 from public.vendor_services s
             where s.vendor_id = v.id and s.name ilike '%' || n.svc || '%'
           ))
  )
  select
    m.id, m.slug, m.business_name, m.description, m.category, m.location,
    m.hero_image_url, m.rating, m.review_count, m.starting_price,
    m.rank as relevance,
    count(*) over () as total_count
  from matched m
  cross join normalised n
  order by
    -- Relevance means: text rank when searching, rating otherwise. Nothing is
    -- boosted, promoted or paid for; there is no hidden ranking signal.
    case when p_sort = 'relevance' and n.q is not null then m.rank end desc nulls last,
    case when p_sort = 'relevance' and n.q is null then m.rating end desc nulls last,
    case when p_sort = 'rating'       then m.rating end desc nulls last,
    case when p_sort = 'price_asc'    then m.starting_price end asc nulls last,
    case when p_sort = 'price_desc'   then m.starting_price end desc nulls last,
    case when p_sort = 'reviews'      then m.review_count end desc nulls last,
    -- Stable tiebreaker: without it, equal-ranked rows can reorder between
    -- pages and a vendor may appear twice or not at all while paginating.
    m.rating desc, m.id
  limit  (select lim from normalised)
  offset (select off from normalised);
$$;

comment on function public.search_vendors is
  'Paginated marketplace search. Runs as the caller so RLS still restricts results to active vendors. Returns total_count via a window function so the UI gets pagination context in one round trip. Sort values: relevance, rating, price_asc, price_desc, reviews.';

grant execute on function public.search_vendors(text,text,text,integer,integer,numeric,text,text,integer,integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- category_counts()
-- ---------------------------------------------------------------------------

-- Powers the homepage category tiles with real counts instead of a hardcoded
-- list. Also runs as the caller, so it counts only publicly visible vendors.
create or replace function public.category_counts()
returns table (category text, vendor_count bigint)
language sql
stable
as $$
  select v.category, count(*)::bigint
  from public.vendors v
  where v.status = 'active'
  group by v.category
  order by count(*) desc, v.category;
$$;

comment on function public.category_counts is
  'Active vendor count per category, for homepage tiles. Runs as caller so counts match what the viewer can actually browse.';

grant execute on function public.category_counts() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- filter_options()
-- ---------------------------------------------------------------------------

-- The filter UI needs the real option lists and the real price bounds. Deriving
-- them from the data avoids a hardcoded city list drifting from the catalogue.
create or replace function public.filter_options()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'categories', (select coalesce(jsonb_agg(distinct category order by category), '[]'::jsonb)
                   from public.vendors where status = 'active'),
    'locations',  (select coalesce(jsonb_agg(distinct location order by location), '[]'::jsonb)
                   from public.vendors where status = 'active'),
    'min_price',  (select coalesce(min(starting_price), 0) from public.vendors where status = 'active'),
    'max_price',  (select coalesce(max(starting_price), 0) from public.vendors where status = 'active')
  );
$$;

comment on function public.filter_options is
  'Distinct categories, locations and price bounds across active vendors, so filter controls reflect the real catalogue.';

grant execute on function public.filter_options() to anon, authenticated;
