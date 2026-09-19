/**
 * Booking data access.
 *
 * Reads go through RLS-protected selects; writes go through two SECURITY
 * DEFINER functions. There is deliberately no client-side authorisation logic
 * here — the database decides what is allowed, and this module only reports
 * what it said.
 *
 * The UI uses `canCustomerCancel` / `canVendorAct` to decide which buttons to
 * render, but those are presentation hints. The server re-validates every
 * transition, so hiding a button is never what stops an action.
 */
import { supabase } from '../lib/supabase';
import type {
  Booking,
  BookingStatus,
  BookingStatusHistoryEntry,
  BookingWithDetails,
} from '../types/database';

const BOOKING_COLUMNS =
  'id, customer_id, vendor_id, vendor_service_id, event_date, event_location, customer_notes, quoted_price, status, created_at, updated_at';

const BOOKING_JOIN = `${BOOKING_COLUMNS}, vendors(id, slug, business_name, category, location), vendor_services(id, name, description)`;

/**
 * Turns a database error into something safe to show.
 *
 * Messages raised by create_booking() and transition_booking_status() are
 * written for end users, so they pass through. Anything else — constraint
 * names, RLS codes, connection failures — is replaced with a generic line and
 * logged for developers.
 */
function toUserMessage(error: { message: string; code?: string }, fallback: string): string {
  // 23505 is our duplicate-request index; the raw text names the index.
  if (error.code === '23505') {
    return 'You already have a live request for this service on that date.';
  }
  const looksInternal =
    !error.message ||
    /violates|constraint|relation|column|permission denied|JWT|row-level/i.test(error.message);

  console.error('[ocasio] booking:', error.code ?? '', error.message);
  return looksInternal ? fallback : error.message;
}

export interface CreateBookingInput {
  vendorServiceId: string;
  eventDate: string;
  eventLocation: string;
  customerNotes?: string;
}

/**
 * Requests a booking.
 *
 * Only intent is sent. customer_id comes from the session, vendor_id and
 * quoted_price are derived from the service, and status is forced to pending —
 * all inside the database.
 */
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const { data, error } = await supabase.rpc('create_booking', {
    p_vendor_service_id: input.vendorServiceId,
    p_event_date: input.eventDate,
    p_event_location: input.eventLocation,
    p_customer_notes: input.customerNotes?.trim() || null,
  });

  if (error) throw new Error(toUserMessage(error, 'Could not submit your booking request.'));
  return data as Booking;
}

/** The signed-in customer's bookings, newest first. */
export async function getCustomerBookings(): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_JOIN)
    .order('created_at', { ascending: false });

  if (error) throw new Error(toUserMessage(error, 'Could not load your bookings.'));
  return (data ?? []) as unknown as BookingWithDetails[];
}

/**
 * One booking by id.
 *
 * RLS restricts this to the customer and the vendor owner, so a booking
 * belonging to anyone else comes back as null and the caller renders
 * not-found. There is no separate permission check to get out of step.
 */
export async function getBookingById(id: string): Promise<BookingWithDetails | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_JOIN)
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(toUserMessage(error, 'Could not load this booking.'));
  return (data as unknown as BookingWithDetails) ?? null;
}

/** Status history for a booking, oldest first. Readable by the two parties. */
export async function getBookingHistory(bookingId: string): Promise<BookingStatusHistoryEntry[]> {
  const { data, error } = await supabase
    .from('booking_status_history')
    .select('id, booking_id, from_status, to_status, changed_by, note, created_at')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(toUserMessage(error, 'Could not load the booking history.'));
  return (data ?? []) as BookingStatusHistoryEntry[];
}

/** Bookings for vendors the signed-in user owns. RLS scopes this. */
export async function getVendorBookings(): Promise<BookingWithDetails[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(BOOKING_JOIN)
    .order('created_at', { ascending: false });

  if (error) throw new Error(toUserMessage(error, 'Could not load booking requests.'));
  return (data ?? []) as unknown as BookingWithDetails[];
}

/**
 * Moves a booking to a new status.
 *
 * The database validates both the transition and the caller's relationship to
 * the booking. An invalid attempt throws with the reason.
 */
export async function transitionBookingStatus(
  bookingId: string,
  newStatus: BookingStatus,
  note?: string,
): Promise<Booking> {
  const { data, error } = await supabase.rpc('transition_booking_status', {
    p_booking_id: bookingId,
    p_new_status: newStatus,
    p_note: note?.trim() || null,
  });

  if (error) throw new Error(toUserMessage(error, 'Could not update this booking.'));
  return data as Booking;
}

/** Convenience wrapper for the customer's only transition. */
export function cancelBooking(bookingId: string, note?: string): Promise<Booking> {
  return transitionBookingStatus(bookingId, 'cancelled', note);
}

// ---------------------------------------------------------------------------
// Presentation hints
//
// These mirror the lifecycle in migration 20260919000004 so the UI can hide
// impossible actions. They are not a security boundary: the server re-checks
// every transition, and hiding a button stops nothing on its own.
// ---------------------------------------------------------------------------

export function canCustomerCancel(status: BookingStatus): boolean {
  return status === 'pending' || status === 'accepted';
}

export function vendorActionsFor(status: BookingStatus): BookingStatus[] {
  if (status === 'pending') return ['accepted', 'declined'];
  if (status === 'accepted') return ['completed', 'cancelled'];
  return [];
}

export const BOOKING_STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'Pending vendor response',
  accepted: 'Accepted by vendor',
  declined: 'Declined by vendor',
  cancelled: 'Cancelled',
  completed: 'Completed',
};
