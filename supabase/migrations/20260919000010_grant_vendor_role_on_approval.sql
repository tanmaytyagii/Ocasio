-- ============================================================================
-- Granting the vendor role on approval
--
-- moderate_vendor() set vendors.status to 'active' and stopped there, so an
-- approved vendor was listed in the marketplace and still carried
-- profiles.role = 'customer'. RequireVendor gates /vendor/dashboard on that
-- role, which meant the person who had just been approved could not open their
-- own dashboard to add the services that make them bookable.
--
-- prevent_role_self_change() already anticipated this. Its comment reads
-- "Roles are assigned through vendor onboarding review" — the review existed,
-- the assignment did not. This migration supplies it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. An escape hatch for role, scoped to a single transaction.
--
-- The guard blocks a role change whenever auth.uid() is set, which is true for
-- an admin acting through PostgREST as much as for a user editing themselves.
-- It now yields to a transaction-local setting, exactly as the status guard in
-- migration 8 does, and only moderate_vendor() ever sets it.
--
-- A user still cannot promote themselves: setting the flag requires executing
-- a SECURITY DEFINER function that checks is_admin() first.
-- ---------------------------------------------------------------------------
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
    if (select auth.uid()) is not null
       and coalesce(current_setting('ocasio.allow_role_grant', true), '') <> 'on' then
      raise exception 'Role cannot be changed by the user. Roles are assigned through vendor onboarding review.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Moderation now carries the role with it.
--
-- Approving or reinstating a listing promotes its owner to 'vendor'. Nothing
-- demotes: a suspended vendor keeps dashboard access so they can see why their
-- listing is not live and keep their services in order, and their listing is
-- already invisible to customers through vendors.status. Taking the role away
-- as well would strip them of their own booking history for no added safety.
--
-- A rejected application never had the role in the first place, so there is
-- nothing to remove there either.
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
  v_granted   boolean := false;
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

  -- Going live is what makes someone a vendor. An admin is never promoted out
  -- of their own role by approving a listing they happen to own.
  if v_next = 'active'::public.vendor_status then
    perform set_config('ocasio.allow_role_grant', 'on', true);

    update public.profiles
       set role = 'vendor'::public.user_role
     where id = v_vendor.owner_id
       and role = 'customer'::public.user_role;

    v_granted := found;

    perform set_config('ocasio.allow_role_grant', 'off', true);
  end if;

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
      'role_granted', v_granted,
      'note', nullif(trim(coalesce(p_note, '')), '')
    )
  );

  return v_vendor;
end;
$$;

comment on function public.moderate_vendor(uuid, text, text) is
  'The only path that changes vendors.status, and the only path that grants the vendor role. Verifies the admin role server-side and records the decision in audit_log.';

revoke all on function public.moderate_vendor(uuid, text, text) from public;
grant execute on function public.moderate_vendor(uuid, text, text) to authenticated;
