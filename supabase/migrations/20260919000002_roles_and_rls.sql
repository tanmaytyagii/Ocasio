-- Ocasio — database-backed roles and Row Level Security
--
-- Replaces the Phase 0 authorization model, in which ProtectedRoute trusted
-- auth.users.raw_user_meta_data.user_type. That field is writable by the user
-- themselves via supabase.auth.updateUser({ data: { user_type: 'vendor' } }),
-- so it could never be an authorization source (audit SEC-3).
--
-- Model:
--   * profiles.role is the only authorization role. Users cannot change it.
--   * Owning a vendors row grants management of THAT vendor only.
--   * Public visibility requires vendors.status = 'active', which only
--     service_role / admin can set.
--
-- Recursion note: a policy ON profiles that SELECTs FROM profiles recurses
-- infinitely. Every cross-table check below therefore goes through a
-- SECURITY DEFINER helper, which runs outside RLS and terminates.

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- Why SECURITY DEFINER: called from policies on vendor_services / vendor_media,
-- which must consult vendors without re-entering vendors' own RLS. Scope is a
-- single boolean over one indexed key; it executes no dynamic SQL and takes no
-- user-supplied SQL text. search_path is pinned so an attacker-controlled
-- schema cannot shadow the referenced tables.
create or replace function public.is_active_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.status = 'active'
  );
$$;

comment on function public.is_active_vendor is
  'True when the vendor exists and is publicly listed. SECURITY DEFINER so vendor_services/vendor_media policies can consult vendors without RLS recursion.';

create or replace function public.owns_vendor(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.vendors v
    where v.id = p_vendor_id and v.owner_id = (select auth.uid())
  );
$$;

comment on function public.owns_vendor is
  'True when the current user owns the vendor. Ownership, not role, authorises vendor management — so a pending applicant can manage their own listing without holding the vendor role.';

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

comment on function public.current_user_role is
  'Reads the caller''s role without RLS recursion. Read-only; cannot be used to set a role.';

revoke execute on function public.is_active_vendor(uuid)    from public;
revoke execute on function public.owns_vendor(uuid)         from public;
revoke execute on function public.current_user_role()       from public;
grant  execute on function public.is_active_vendor(uuid)    to anon, authenticated;
grant  execute on function public.owns_vendor(uuid)         to authenticated;
grant  execute on function public.current_user_role()       to authenticated;

-- ---------------------------------------------------------------------------
-- Profile provisioning on signup
-- ---------------------------------------------------------------------------

-- Role is hardcoded to 'customer'. raw_user_meta_data is user-supplied, so any
-- user_type/role key in it is deliberately ignored: copying it would recreate
-- the exact privilege-escalation hole this migration closes.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    'customer'::public.user_role   -- never from metadata
  )
  on conflict (id) do nothing;     -- idempotent; tolerates auth retries
  return new;
end;
$$;

comment on function public.handle_new_user is
  'Creates a profile for every new auth user with role=customer. Any role supplied in signup metadata is ignored by design.';

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guard: users cannot change their own role
-- ---------------------------------------------------------------------------

-- RLS WITH CHECK cannot express "this column may not change" without selecting
-- the old row from the same table, which recurses. A BEFORE UPDATE trigger
-- compares OLD/NEW directly and runs after RLS has admitted the row.
create or replace function public.prevent_role_self_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    -- Block whenever an end-user identity is attached to the statement. Any
    -- PostgREST request carrying a user JWT has a non-null auth.uid(); server
    -- side contexts (service_role, migrations, seeds, psql admin tooling) do
    -- not. Testing auth.uid() rather than auth.role() <> 'service_role' is
    -- deliberate: auth.role() is NULL on a direct connection, and NULL <> 'x'
    -- is NULL, not true, so that form silently permitted the change.
    if (select auth.uid()) is not null then
      raise exception 'Role cannot be changed by the user. Roles are assigned through vendor onboarding review.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

comment on function public.prevent_role_self_change is
  'Blocks self-service role escalation. Only service_role may alter profiles.role.';

create trigger profiles_no_self_role_change
  before update on public.profiles
  for each row execute function public.prevent_role_self_change();

-- ---------------------------------------------------------------------------
-- Guard: vendors cannot approve or re-rate themselves
-- ---------------------------------------------------------------------------

create or replace function public.protect_vendor_moderated_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Same rule as prevent_role_self_change: a statement with no end-user
  -- identity is a server-side/admin context and may moderate.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.status is distinct from old.status then
    raise exception 'Vendor status is set by review, not by the vendor.'
      using errcode = '42501';
  end if;

  -- Aggregates are derived from reviews (Phase 4), never self-reported.
  if new.rating is distinct from old.rating
     or new.review_count is distinct from old.review_count then
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

create trigger vendors_protect_moderated_fields
  before update on public.vendors
  for each row execute function public.protect_vendor_moderated_fields();

-- ---------------------------------------------------------------------------
-- Controlled vendor onboarding
-- ---------------------------------------------------------------------------

-- The ONLY way a user creates a vendor record. There is no INSERT policy on
-- vendors, so a client cannot insert one directly with status='active'.
-- This always produces a 'pending' record and never touches profiles.role.
create or replace function public.request_vendor_onboarding(
  p_business_name text,
  p_category      text,
  p_location      text,
  p_description   text default null,
  p_phone         text default null,
  p_email         text default null,
  p_website       text default null
)
returns public.vendors
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  -- Declared text, not citext: this function pins search_path to '', so the
  -- citext type and its operators (which live in the extensions schema) are not
  -- resolvable here. Comparing slug::text avoids needing them at all, and is
  -- exact because vendors_slug_format already constrains slug to lowercase.
  v_slug    text;
  v_base    text;
  v_suffix  integer := 0;
  v_vendor  public.vendors;
begin
  if v_uid is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if coalesce(trim(p_business_name), '') = '' then
    raise exception 'Business name is required.' using errcode = '22023';
  end if;

  -- Slugify: lowercase, non-alphanumerics to hyphens, trim hyphens.
  v_base := trim(both '-' from regexp_replace(lower(trim(p_business_name)), '[^a-z0-9]+', '-', 'g'));
  if v_base = '' then
    v_base := 'vendor';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.vendors where slug::text = v_slug) loop
    v_suffix := v_suffix + 1;
    v_slug := v_base || '-' || v_suffix::text;
  end loop;

  insert into public.vendors (
    owner_id, business_name, slug, description, category, location,
    phone, email, website, status
  )
  values (
    v_uid, trim(p_business_name), v_slug, p_description, p_category, p_location,
    p_phone, p_email, p_website,
    'pending'::public.vendor_status   -- never 'active'
  )
  returning * into v_vendor;

  return v_vendor;
end;
$$;

comment on function public.request_vendor_onboarding is
  'Creates a PENDING vendor application owned by the caller. The only insert path into vendors. Cannot produce an active listing and does not change profiles.role — approval is a separate service_role action.';

revoke execute on function public.request_vendor_onboarding(text,text,text,text,text,text,text) from public;
grant  execute on function public.request_vendor_onboarding(text,text,text,text,text,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- POLICIES — profiles
-- ---------------------------------------------------------------------------

-- Private. Public vendor information lives in vendors, not here, so profiles
-- never need to be world-readable.
create policy "profiles: read own"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: update own"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- No INSERT policy: profiles are created by the signup trigger.
-- No DELETE policy: profiles cascade from auth.users.

-- ---------------------------------------------------------------------------
-- POLICIES — vendors
-- ---------------------------------------------------------------------------

create policy "vendors: public read active"
  on public.vendors for select
  to anon, authenticated
  using (status = 'active');

create policy "vendors: owner reads own"
  on public.vendors for select
  to authenticated
  using ((select auth.uid()) = owner_id);

create policy "vendors: owner updates own"
  on public.vendors for update
  to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- No INSERT policy: use request_vendor_onboarding().
-- No DELETE policy: removal is a moderation action.

-- ---------------------------------------------------------------------------
-- POLICIES — vendor_services
-- ---------------------------------------------------------------------------

create policy "vendor_services: public read for active vendors"
  on public.vendor_services for select
  to anon, authenticated
  using (public.is_active_vendor(vendor_id));

create policy "vendor_services: owner reads own"
  on public.vendor_services for select
  to authenticated
  using (public.owns_vendor(vendor_id));

create policy "vendor_services: owner inserts own"
  on public.vendor_services for insert
  to authenticated
  with check (public.owns_vendor(vendor_id));

create policy "vendor_services: owner updates own"
  on public.vendor_services for update
  to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));

create policy "vendor_services: owner deletes own"
  on public.vendor_services for delete
  to authenticated
  using (public.owns_vendor(vendor_id));

-- ---------------------------------------------------------------------------
-- POLICIES — vendor_media
-- ---------------------------------------------------------------------------

create policy "vendor_media: public read for active vendors"
  on public.vendor_media for select
  to anon, authenticated
  using (public.is_active_vendor(vendor_id));

create policy "vendor_media: owner reads own"
  on public.vendor_media for select
  to authenticated
  using (public.owns_vendor(vendor_id));

create policy "vendor_media: owner inserts own"
  on public.vendor_media for insert
  to authenticated
  with check (public.owns_vendor(vendor_id));

create policy "vendor_media: owner updates own"
  on public.vendor_media for update
  to authenticated
  using (public.owns_vendor(vendor_id))
  with check (public.owns_vendor(vendor_id));

create policy "vendor_media: owner deletes own"
  on public.vendor_media for delete
  to authenticated
  using (public.owns_vendor(vendor_id));

-- ---------------------------------------------------------------------------
-- POLICIES — favorites
-- ---------------------------------------------------------------------------

create policy "favorites: read own"
  on public.favorites for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "favorites: insert own"
  on public.favorites for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "favorites: delete own"
  on public.favorites for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- No UPDATE policy: a favourite is created or removed, never edited.
