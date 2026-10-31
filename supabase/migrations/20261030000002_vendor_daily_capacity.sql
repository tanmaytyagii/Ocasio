-- ============================================================================
-- Ocasio — vendor daily capacity
--
-- Two customers could request the same vendor for the same date, and the vendor
-- could accept both. A venue double-booked on a wedding day is the failure a
-- marketplace like this cannot have, and nothing stopped it.
--
-- Each vendor now has a daily capacity: how many bookings it can accept for one
-- event date. transition_booking_status() enforces it at the moment a booking
-- is accepted, inside the same transaction, under a lock.
--
-- What counts against capacity: accepted and completed bookings — work the
-- vendor has committed to on that date. Pending requests do not (the vendor
-- has not agreed to them), and declined or cancelled bookings do not (the
-- commitment is gone). So declining or cancelling frees the slot.
--
-- Lowering capacity never cancels anything already accepted; it only stops
-- further acceptances until the date is under the new limit.
-- ============================================================================

-- Default 1: one event a day is the safe assumption, and the right one for a
-- venue. A caterer or photographer with several teams raises it from the
-- vendor dashboard; the existing "owner updates own" policy covers the column,
-- and protect_vendor_moderated_fields() leaves it alone.
alter table public.vendors
  add column daily_capacity integer not null default 1
    constraint vendors_daily_capacity_range check (daily_capacity between 1 and 100);

comment on column public.vendors.daily_capacity is
  'How many bookings the vendor can accept for one event date. Enforced by transition_booking_status() when a booking is accepted.';

-- The count below runs on every acceptance.
create index bookings_vendor_date_committed_idx
  on public.bookings (vendor_id, event_date)
  where status in ('accepted', 'completed');

-- ---------------------------------------------------------------------------
-- transition_booking_status() — unchanged from migration 4 except the capacity
-- check, marked below.
-- ---------------------------------------------------------------------------
create or replace function public.transition_booking_status(
  p_booking_id uuid,
  p_new_status public.booking_status,
  p_note       text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := (select auth.uid());
  v_booking     public.bookings;
  v_from        public.booking_status;
  v_is_customer boolean;
  v_is_vendor   boolean;
  v_allowed     boolean := false;
  v_capacity    integer;
  v_committed   integer;
begin
  if v_uid is null then
    raise exception 'You must be signed in.' using errcode = '42501';
  end if;

  -- FOR UPDATE serialises concurrent transitions on the same booking, so two
  -- simultaneous requests cannot both read 'pending' and both act on it.
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    -- Same message whether the booking is missing or not yours: a different
    -- error would let someone probe for the existence of other people's rows.
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  v_is_customer := v_booking.customer_id = v_uid;
  v_is_vendor   := exists (
    select 1 from public.vendors v
    where v.id = v_booking.vendor_id and v.owner_id = v_uid
  );

  if not (v_is_customer or v_is_vendor) then
    raise exception 'Booking not found.' using errcode = 'P0002';
  end if;

  if v_booking.status = p_new_status then
    raise exception 'This booking is already %.', p_new_status using errcode = '22023';
  end if;

  if v_booking.status in ('declined', 'cancelled', 'completed') then
    raise exception 'A % booking cannot change status.', v_booking.status using errcode = '22023';
  end if;

  v_allowed := case
    when v_booking.status = 'pending'  and p_new_status = 'accepted'  then v_is_vendor
    when v_booking.status = 'pending'  and p_new_status = 'declined'  then v_is_vendor
    when v_booking.status = 'pending'  and p_new_status = 'cancelled' then v_is_customer
    when v_booking.status = 'accepted' and p_new_status = 'completed' then v_is_vendor
    when v_booking.status = 'accepted' and p_new_status = 'cancelled' then v_is_customer or v_is_vendor
    else false
  end;

  if not v_allowed then
    raise exception 'You cannot change this booking from % to %.', v_booking.status, p_new_status
      using errcode = '42501';
  end if;

  -- ---- capacity (new) -----------------------------------------------------
  if p_new_status = 'accepted' then
    -- The booking lock above does not order two acceptances of DIFFERENT
    -- bookings for the same vendor and date: each locks its own row, both
    -- count the same committed bookings, and both accept. Locking the vendor
    -- row makes every acceptance for this vendor take its turn.
    --
    -- NO KEY UPDATE rather than UPDATE, so customers' create_booking() inserts
    -- — which take KEY SHARE on the vendor through the foreign key — are never
    -- blocked by a vendor accepting.
    select v.daily_capacity into v_capacity
    from public.vendors v
    where v.id = v_booking.vendor_id
    for no key update;

    -- A new statement, so under READ COMMITTED (PostgREST's isolation level)
    -- it sees every acceptance that committed while this one waited above.
    select count(*) into v_committed
    from public.bookings b
    where b.vendor_id = v_booking.vendor_id
      and b.event_date = v_booking.event_date
      and b.status in ('accepted', 'completed')
      and b.id <> v_booking.id;

    if v_committed >= v_capacity then
      raise exception 'You have already accepted % for %, which is your daily limit. Decline this request, or raise your daily limit in your profile.',
        case when v_committed = 1 then '1 booking' else v_committed || ' bookings' end,
        to_char(v_booking.event_date, 'FMDD Mon YYYY')
        using errcode = '23P01';
    end if;
  end if;
  -- ---- end capacity -------------------------------------------------------

  -- Captured before the UPDATE so the history row records where it came from.
  v_from := v_booking.status;

  -- Lets this function's UPDATE past protect_booking_fields(), which otherwise
  -- rejects every status change. Scoped to the transaction.
  perform set_config('ocasio.allow_status_change', 'on', true);

  update public.bookings
  set status = p_new_status
  where id = p_booking_id
  returning * into v_booking;

  perform set_config('ocasio.allow_status_change', 'off', true);

  insert into public.booking_status_history (booking_id, from_status, to_status, changed_by, note)
  values (p_booking_id, v_from, p_new_status, v_uid, nullif(trim(coalesce(p_note, '')), ''));

  return v_booking;
end;
$$;

comment on function public.transition_booking_status is
  'The only path that changes booking status. Validates the transition against the lifecycle and the caller''s relationship to the booking, enforces the vendor''s daily capacity on acceptance (under a vendor-row lock), then records an immutable history row.';

revoke execute on function public.transition_booking_status(uuid, public.booking_status, text) from public, anon;
grant  execute on function public.transition_booking_status(uuid, public.booking_status, text) to authenticated;
