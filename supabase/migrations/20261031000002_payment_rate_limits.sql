-- ============================================================================
-- Ocasio — request budgets for the payment functions (audit F-17)
--
-- payments-create-order and payments-refund are called by signed-in users, and
-- each refund request reaches Razorpay's API. Nothing limited how often one
-- account could call them: a script on one vendor account could split a
-- payment into hundreds of ₹1 refunds and spend the merchant's Razorpay API
-- quota for everyone.
--
-- The budget is counted here, not in the function's memory, because edge
-- functions run as many short-lived instances: an in-memory counter would
-- reset with every cold start and never see the other instances.
--
-- Fixed windows: one row per (bucket, window). Callers name the bucket and the
-- limit; only the service role can call, and the functions pass the user id
-- they verified with Supabase Auth, so a browser cannot spend — or reset —
-- anyone's budget, including its own.
-- ============================================================================

create table public.rate_limit_counters (
  bucket       text        not null check (length(bucket) between 1 and 200),
  window_start timestamptz not null,
  hits         integer     not null default 0 check (hits >= 0),
  primary key (bucket, window_start)
);

comment on table public.rate_limit_counters is
  'Request counts per bucket and fixed window, written only by consume_rate_limit(). No client access.';

-- No policies: RLS on, every client role refused.
alter table public.rate_limit_counters enable row level security;
revoke all on public.rate_limit_counters from public, anon, authenticated;
grant select, insert, update, delete on public.rate_limit_counters to service_role;

create or replace function public.consume_rate_limit(
  p_bucket         text,
  p_max            integer,
  p_window_seconds integer
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_window interval;
  v_start  timestamptz;
  v_hits   integer;
begin
  if p_bucket is null or length(p_bucket) not between 1 and 200
     or p_max is null or p_max not between 1 and 10000
     or p_window_seconds is null or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit.' using errcode = '22023';
  end if;

  v_window := make_interval(secs => p_window_seconds);
  v_start  := date_bin(v_window, now(), timestamptz '2000-01-01 00:00:00+00');

  -- Atomic under concurrency: the conflicting insert takes the row lock, so
  -- simultaneous requests are counted one after another, never as one.
  insert into public.rate_limit_counters as c (bucket, window_start, hits)
  values (p_bucket, v_start, 1)
  on conflict (bucket, window_start) do update set hits = c.hits + 1
  returning c.hits into v_hits;

  -- Earlier windows for this bucket are over; keep the table small.
  delete from public.rate_limit_counters r
  where r.bucket = p_bucket and r.window_start < v_start;

  allowed := v_hits <= p_max;
  retry_after_seconds := case
    when v_hits <= p_max then 0
    else greatest(1, ceil(extract(epoch from (v_start + v_window - now())))::integer)
  end;
  return next;
end;
$$;

comment on function public.consume_rate_limit(text, integer, integer) is
  'Counts one request against a bucket''s budget for the current fixed window and says whether it is within p_max. Service role only (SECURITY_AUDIT F-17).';

revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;
