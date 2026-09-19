/**
 * Review data access.
 *
 * Same shape as the booking and payment services: reads go through
 * RLS-protected selects, the single write goes through a SECURITY DEFINER
 * function, and there is no client-side authorization logic.
 *
 * Reviews are immutable once written — there is no update or delete function
 * here because there is no policy permitting either.
 */
import { supabase } from '../lib/supabase';
import type { Review } from '../types/database';

// customer_id is deliberately absent: no client role can read it.
const REVIEW_COLUMNS = 'id, booking_id, vendor_id, rating, body, created_at, updated_at';

function fail(error: { message: string; code?: string }, fallback: string): never {
  if (error.code === '23505') {
    console.error('[ocasio] review:', error.code, error.message);
    throw new Error('This booking has already been reviewed.');
  }
  const looksInternal =
    !error.message ||
    /violates|constraint|relation|column|permission denied|JWT|row-level/i.test(error.message);
  console.error('[ocasio] review:', error.code ?? '', error.message);
  throw new Error(looksInternal ? fallback : error.message);
}

/**
 * Leaves a review for a completed booking.
 *
 * Neither the vendor nor the reviewer is a parameter: the server derives both
 * from the booking, so neither can be forged.
 */
export async function createReview(
  bookingId: string,
  rating: number,
  body?: string,
): Promise<Review> {
  const { data, error } = await supabase.rpc('create_review', {
    p_booking_id: bookingId,
    p_rating: rating,
    p_body: body?.trim() || null,
  });
  if (error) fail(error, 'Could not submit your review.');
  return data as Review;
}

/** The review for a booking, if one exists. Public. */
export async function getReviewForBooking(bookingId: string): Promise<Review | null> {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_COLUMNS)
    .eq('booking_id', bookingId)
    .maybeSingle();

  if (error) fail(error, 'Could not load the review.');
  return (data as unknown as Review) ?? null;
}

/** Reviews for a vendor, newest first. Public. */
export async function listVendorReviews(vendorId: string, limit = 20): Promise<Review[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select(REVIEW_COLUMNS)
    .eq('vendor_id', vendorId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) fail(error, 'Could not load reviews.');
  return (data ?? []) as unknown as Review[];
}

/**
 * Whether the review action should be offered.
 *
 * A presentation hint mirroring create_review(): only the customer, only a
 * completed booking, only once. The server re-checks all three.
 */
export function canReview(bookingStatus: string, isCustomer: boolean, existing: Review | null) {
  return isCustomer && bookingStatus === 'completed' && existing === null;
}
