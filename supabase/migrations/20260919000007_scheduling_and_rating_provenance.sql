-- Ocasio — reconciliation scheduling and rating provenance
--
-- Phase 5.1. Two of the three limitations recorded at the end of Phase 5:
--
--   1  nothing scheduled the reconciliation sweep
--   2  seeded demo ratings were indistinguishable from review-derived ones
--
-- The third — account deletion blocked by ON DELETE RESTRICT — is deliberately
-- NOT changed here. It needs a product and privacy decision about what happens
-- to bookings, payments and review text when a person leaves, and guessing at
-- that in a migration would be worse than the current honest refusal. It is
-- documented in docs/OCASIO_DATA_RETENTION.md and pinned by tests.

-- ===========================================================================
-- PART 1 — scheduled reconciliation
-- ===========================================================================
--
-- The sweep itself already exists: supabase/functions/payments-reconcile asks
-- the provider about payments stranded in 'processing' and hands the answer to
-- reconcile_payment(). Nothing invoked it.
--
-- This adds the invocation only. There is no second reconciliation
-- implementation: pg_cron calls a function whose entire job is to POST to that
-- edge function. All the rules — idempotency, replay protection, "an
-- inconclusive answer changes nothing" — stay where they were.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Reads its configuration from Vault rather than taking it as arguments, so the
-- service-role key is never written into a migration, a cron command, or any
-- table a client can read.
--
-- Operators set these once:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/payments-reconcile',
--                              'ocasio_reconcile_url');
--   select vault.create_secret('<service-role key>', 'ocasio_reconcile_service_key');
--
-- Until they do, the sweep does nothing and says so. It fails closed and
-- visibly: a silent no-op would let payments strand exactly the way this phase
-- is meant to prevent.
create or replace function public.invoke_payment_reconciliation()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url        text;
  v_key        text;
  v_request_id bigint;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'ocasio_reconcile_url';

  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'ocasio_reconcile_service_key';

  if coalesce(trim(v_url), '') = '' or coalesce(trim(v_key), '') = '' then
    perform public.write_audit(
      'reconciliation.sweep_skipped', 'payment', null,
      jsonb_build_object('reason', 'vault secrets not configured')
    );
    raise warning 'Payment reconciliation sweep skipped: set ocasio_reconcile_url and ocasio_reconcile_service_key in Vault.';
    return null;
  end if;

  -- Asynchronous by design: pg_net queues the request and the cron job returns
  -- immediately, so a slow or unreachable function cannot block the scheduler.
  -- The sweep's own results are recorded by reconcile_payment(), not here.
  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  -- The key is never audited; only the queued request id.
  perform public.write_audit(
    'reconciliation.sweep_invoked', 'payment', null,
    jsonb_build_object('net_request_id', v_request_id)
  );

  return v_request_id;
end;
$$;

comment on function public.invoke_payment_reconciliation is
  'Posts to the payments-reconcile edge function using credentials from Vault. Fails closed and audits when unconfigured. Invoked by the ocasio-reconcile-stale-payments cron job.';

-- Operators may trigger a sweep manually; no client role may.
revoke execute on function public.invoke_payment_reconciliation() from public;
revoke execute on function public.invoke_payment_reconciliation() from anon, authenticated;
grant  execute on function public.invoke_payment_reconciliation() to service_role;

-- Every 15 minutes.
--
-- The sweep only acts on payments already stranded past the edge function's
-- threshold (RECONCILE_STALE_MINUTES, default 30), so a 15-minute cadence
-- bounds how long a stranded payment waits without hammering the provider.
-- Re-running within the same hour is harmless: reconcile_payment() derives its
-- event id from the sweep reference, and UNIQUE (provider, provider_event_id)
-- makes a repeat apply at most once.
do $$
begin
  -- Idempotent: unschedule first so re-applying migrations does not stack jobs.
  perform cron.unschedule('ocasio-reconcile-stale-payments')
  where exists (select 1 from cron.job where jobname = 'ocasio-reconcile-stale-payments');

  perform cron.schedule(
    'ocasio-reconcile-stale-payments',
    '*/15 * * * *',
    $cron$select public.invoke_payment_reconciliation();$cron$
  );
end;
$$;

-- ===========================================================================
-- PART 2 — rating provenance
-- ===========================================================================
--
-- Phase 5 made vendors.rating and review_count derived from reviews. The 40
-- seeded demo vendors still carry fabricated values with no reviews behind
-- them, and nothing distinguished the two. A vendor could show "4.8 · 290
-- reviews" directly above "No written reviews yet".
--
-- The fix is to record where the number came from, not to delete it:
--
--   * zeroing the seed would make the demo catalogue useless and would break
--     the Phase 2 tests that filter on rating (p_min_rating: 4.8 expects
--     results), which the brief required preserving
--   * inventing review rows to justify the seeded numbers would be fabricating
--     content, which the brief forbids
--
-- So the values stay, ranking and filtering are untouched, and the UI can say
-- plainly which figures are illustrative.

alter table public.vendors
  add column rating_is_demo boolean not null default false;

comment on column public.vendors.rating_is_demo is
  'True when rating/review_count are seeded demo values with no reviews behind them. Set false permanently by recalculate_vendor_rating() the moment a real review arrives.';

-- Flags demo vendors in a database that has ALREADY been seeded — i.e. an
-- existing deployment. On a fresh `db reset` this matches nothing, because
-- migrations run before seed.sql; there the seed sets the column itself.
-- Both paths are needed, and both are idempotent.
--
-- New vendors default to false and start at 0/0, which is honest: they have no
-- reviews and no fabricated figure either.
update public.vendors v
set rating_is_demo = true
where exists (
  select 1 from public.profiles p
  where p.id = v.owner_id and p.full_name = 'Ocasio Demo Vendor'
);

-- The moment a real review lands, the aggregate is recomputed from reviews and
-- the flag drops for good. A vendor cannot go back to demo figures.
create or replace function public.recalculate_vendor_rating()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor_id uuid := coalesce(new.vendor_id, old.vendor_id);
  v_rating    numeric(2,1);
  v_count     integer;
begin
  select
    coalesce(round(avg(rating)::numeric, 1), 0),
    count(*)
  into v_rating, v_count
  from public.reviews
  where vendor_id = v_vendor_id;

  perform set_config('ocasio.allow_rating_recompute', 'on', true);
  update public.vendors
  set rating = v_rating,
      review_count = v_count,
      -- Once real, always real.
      rating_is_demo = false
  where id = v_vendor_id;
  perform set_config('ocasio.allow_rating_recompute', 'off', true);

  return null;
end;
$$;

-- rating_is_demo is an aggregate-provenance field, so it gets the same
-- protection as the aggregates themselves: no end-user identity may write it.
create or replace function public.protect_vendor_moderated_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Vendor status is set by review, not by the vendor.'
      using errcode = '42501';
  end if;

  if (new.rating is distinct from old.rating
      or new.review_count is distinct from old.review_count
      or new.rating_is_demo is distinct from old.rating_is_demo)
     and coalesce(current_setting('ocasio.allow_rating_recompute', true), '') <> 'on' then
    raise exception 'Rating and review_count are derived from reviews and cannot be set directly.'
      using errcode = '42501';
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'Vendor ownership cannot be reassigned.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Readable wherever the rating is, so a listing can label the figure too.
grant select (rating_is_demo) on public.vendors to anon, authenticated;

-- ---------------------------------------------------------------------------
-- search_vendors(): carry the flag through
-- ---------------------------------------------------------------------------
--
-- Dropped and recreated rather than replaced: the return type gains a column,
-- and CREATE OR REPLACE cannot change a function's signature. Everything else
-- about it — matching, ranking, filters, sorts, the stable tiebreaker — is
-- byte-identical to migration 20260919000003.

drop function if exists public.search_vendors(text, text, text, integer, integer, numeric, text, text, integer, integer);

create function public.search_vendors(
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
  rating_is_demo boolean,
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
    select
      v.id, v.slug, v.business_name, v.description, v.category, v.location,
      v.hero_image_url, v.rating, v.review_count, v.rating_is_demo, v.starting_price,
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
    m.hero_image_url, m.rating, m.review_count, m.rating_is_demo, m.starting_price,
    m.rank as relevance,
    count(*) over () as total_count
  from matched m
  cross join normalised n
  order by
    case when p_sort = 'relevance' and n.q is not null then m.rank end desc nulls last,
    case when p_sort = 'relevance' and n.q is null then m.rating end desc nulls last,
    case when p_sort = 'rating'       then m.rating end desc nulls last,
    case when p_sort = 'price_asc'    then m.starting_price end asc nulls last,
    case when p_sort = 'price_desc'   then m.starting_price end desc nulls last,
    case when p_sort = 'reviews'      then m.review_count end desc nulls last,
    m.rating desc, m.id
  limit  (select lim from normalised)
  offset (select off from normalised);
$$;

comment on function public.search_vendors is
  'Paginated marketplace search. Runs as the caller so RLS still restricts results to active vendors. Returns total_count via a window function, and rating_is_demo so a listing can label a seeded figure. Sort values: relevance, rating, price_asc, price_desc, reviews.';

grant execute on function public.search_vendors(text,text,text,integer,integer,numeric,text,text,integer,integer)
  to anon, authenticated;
