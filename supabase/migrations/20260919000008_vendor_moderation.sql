-- ============================================================================
-- Vendor moderation
--
-- request_vendor_onboarding() has existed since migration 2 and always created
-- vendors with status 'pending'. Nothing could move them off it: the frontend
-- never called the function, and no path existed to approve what it created.
-- This migration supplies that path.
--
-- The shape follows the rule the rest of the schema uses — the client supplies
-- intent, never facts. There is no admin UPDATE policy on vendors. Moderation
-- happens inside one SECURITY DEFINER function that re-derives the caller's
-- role from the database and touches exactly one column.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. An escape hatch for status, scoped to a single transaction.
--
-- protect_vendor_moderated_fields() refuses every status change whenever
-- auth.uid() is set, which is always true through PostgREST. That is correct
-- for a vendor editing their own row and fatal for an admin reviewing it, so
-- the guard now yields to a transaction-local setting that only a SECURITY
-- DEFINER function can set. set_config(..., true) is transaction-scoped: it
-- cannot leak into the next statement on a pooled connection.
--
-- Rating and ownership keep their original protection unchanged.
-- ---------------------------------------------------------------------------
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

  if new.status is distinct from old.status
     and coalesce(current_setting('ocasio.allow_moderation', true), '') <> 'on' then
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

-- ---------------------------------------------------------------------------
-- 2. Role check, derived from the database.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select role = 'admin'::public.user_role
       from public.profiles
      where id = (select auth.uid())),
    false
  );
$$;

comment on function public.is_admin() is
  'True when the calling user has the admin role in public.profiles. Never reads client-supplied metadata.';

-- ---------------------------------------------------------------------------
-- 3. The moderation queue.
--
-- A function rather than an admin SELECT policy on vendors, for two reasons:
-- it keeps the table policies as narrow as they already are, and the reviewer
-- needs the applicant's email, which lives in auth.users and is not reachable
-- through PostgREST at all.
--
-- Returns a curated shape. It does not expose password hashes, tokens or any
-- other auth.users column.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_vendors(
  p_status public.vendor_status default null,
  p_query  text default null
)
returns table (
  id             uuid,
  business_name  text,
  slug           text,
  category       text,
  location       text,
  description    text,
  phone          text,
  email          text,
  website        text,
  status         public.vendor_status,
  created_at     timestamptz,
  updated_at     timestamptz,
  owner_id       uuid,
  owner_email    text,
  service_count  bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.id, v.business_name, v.slug::text, v.category, v.location, v.description,
    v.phone, v.email, v.website, v.status, v.created_at, v.updated_at,
    v.owner_id, u.email::text as owner_email,
    (select count(*) from public.vendor_services s where s.vendor_id = v.id) as service_count
  from public.vendors v
  left join auth.users u on u.id = v.owner_id
  where public.is_admin()
    and (p_status is null or v.status = p_status)
    and (
      p_query is null or trim(p_query) = ''
      or v.business_name ilike '%' || trim(p_query) || '%'
      or v.location      ilike '%' || trim(p_query) || '%'
      or v.category      ilike '%' || trim(p_query) || '%'
    )
  order by
    case v.status when 'pending' then 0 when 'active' then 1 else 2 end,
    v.created_at desc;
$$;

comment on function public.admin_list_vendors(public.vendor_status, text) is
  'Moderation queue. Returns nothing at all unless is_admin() — the predicate is inside the query, so a non-admin gets an empty set rather than an error.';

-- ---------------------------------------------------------------------------
-- 4. The only write path for vendor status.
--
-- Updates one column. owner_id, rating, review_count, business fields and every
-- other column are untouched, and the trigger above still refuses an ownership
-- change even from in here.
--
-- vendor_status has three values — pending, active, suspended. There is no
-- 'rejected', so a rejection records status 'suspended' and keeps the
-- distinction in the audit trail, where it belongs. Adding an enum value is a
-- schema decision for a later phase, not a side effect of wiring up a console.
-- ---------------------------------------------------------------------------
create or replace function public.moderate_vendor(
  p_vendor_id uuid,
  p_action    text,
  p_note      text default null
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vendor    public.vendors;
  v_previous  public.vendor_status;
  v_next      public.vendor_status;
begin
  if not public.is_admin() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;

  if p_action not in ('approve', 'reject', 'suspend', 'reinstate') then
    raise exception 'Unknown moderation action.' using errcode = '22023';
  end if;

  select * into v_vendor from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'Vendor not found.' using errcode = 'P0002';
  end if;

  v_previous := v_vendor.status;
  v_next := case p_action
              when 'approve'   then 'active'::public.vendor_status
              when 'reinstate' then 'active'::public.vendor_status
              else 'suspended'::public.vendor_status
            end;

  if v_previous = v_next then
    raise exception 'Vendor is already in that state.' using errcode = '22023';
  end if;

  -- Transaction-local, and only ever set here.
  perform set_config('ocasio.allow_moderation', 'on', true);

  update public.vendors
     set status = v_next
   where id = p_vendor_id
  returning * into v_vendor;

  perform set_config('ocasio.allow_moderation', 'off', true);

  perform public.write_audit(
    case p_action
      when 'approve'   then 'vendor.approved'
      when 'reject'    then 'vendor.rejected'
      when 'suspend'   then 'vendor.suspended'
      when 'reinstate' then 'vendor.reinstated'
    end,
    'vendor',
    p_vendor_id,
    jsonb_build_object(
      'action', p_action,
      'from_status', v_previous,
      'to_status', v_next,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return v_vendor;
end;
$$;

comment on function public.moderate_vendor(uuid, text, text) is
  'The only path that changes vendors.status. Verifies the admin role server-side, updates one column, and records the decision in audit_log.';

-- ---------------------------------------------------------------------------
-- 5. Grants. Both functions verify the caller themselves and fail closed.
-- ---------------------------------------------------------------------------
revoke all on function public.is_admin() from public;
revoke all on function public.admin_list_vendors(public.vendor_status, text) from public;
revoke all on function public.moderate_vendor(uuid, text, text) from public;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_list_vendors(public.vendor_status, text) to authenticated;
grant execute on function public.moderate_vendor(uuid, text, text) to authenticated;
