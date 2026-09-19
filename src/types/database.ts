/**
 * Database row types.
 *
 * Kept hand-written and deliberately minimal. `supabase gen types` requires
 * either a running local stack or a linked remote project, so committing
 * generated types would make the build depend on infrastructure that
 * contributors may not have running.
 *
 * `npm run db:types` regenerates the full generated file into
 * src/types/supabase.generated.ts once a local stack is up.
 *
 * Source of truth: supabase/migrations/
 */

export type UserRole = 'customer' | 'vendor' | 'admin';
export type VendorStatus = 'pending' | 'active' | 'suspended';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  owner_id: string;
  business_name: string;
  slug: string;
  description: string | null;
  category: string;
  location: string;
  status: VendorStatus;
  phone: string | null;
  email: string | null;
  website: string | null;
  business_hours: string | null;
  hero_image_url: string | null;
  rating: number;
  review_count: number;
  starting_price: number | null;
  created_at: string;
  updated_at: string;
}

/**
 * A vendor as the public marketplace sees one.
 *
 * owner_id is absent by design: it is an auth.users UUID and anon holds no
 * column privilege on it (migration 20260919000003). Public queries must not
 * request it.
 */
export type PublicVendor = Omit<Vendor, 'owner_id'>;

export interface VendorService {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number | null;
  /** Whether the service accepts new bookings. Existing bookings are unaffected. */
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VendorMedia {
  id: string;
  vendor_id: string;
  url: string;
  alt_text: string | null;
  sort_order: number;
  created_at: string;
}

export interface Favorite {
  id: string;
  user_id: string;
  vendor_id: string;
  created_at: string;
}

/** A vendor with its related rows, as the detail page needs it. */
export interface VendorWithDetails extends PublicVendor {
  vendor_services: VendorService[];
  vendor_media: VendorMedia[];
}

/** One row from search_vendors(). Narrower than a full vendor by design. */
export interface VendorSearchResult {
  id: string;
  slug: string;
  business_name: string;
  description: string | null;
  category: string;
  location: string;
  hero_image_url: string | null;
  rating: number;
  review_count: number;
  starting_price: number | null;
  relevance: number;
  total_count: number;
}

export type VendorSort = 'relevance' | 'rating' | 'price_asc' | 'price_desc' | 'reviews';

export interface FilterOptions {
  categories: string[];
  locations: string[];
  min_price: number;
  max_price: number;
}

export interface CategoryCount {
  category: string;
  vendor_count: number;
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------

export type BookingStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'completed';

/** Statuses from which nothing can change. */
export const TERMINAL_BOOKING_STATUSES: readonly BookingStatus[] = [
  'declined',
  'cancelled',
  'completed',
];

export interface Booking {
  id: string;
  customer_id: string;
  vendor_id: string;
  vendor_service_id: string;
  event_date: string;
  event_location: string;
  customer_notes: string | null;
  /** Integer rupees, derived server-side. Informational: no payments exist. */
  quoted_price: number;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
}

export interface BookingStatusHistoryEntry {
  id: string;
  booking_id: string;
  /** Null on the opening row: the booking did not exist before it was requested. */
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

/** Joined shape used by the booking lists and detail pages. */
export interface BookingWithDetails extends Booking {
  vendors: Pick<Vendor, 'id' | 'slug' | 'business_name' | 'category' | 'location'> | null;
  vendor_services: Pick<VendorService, 'id' | 'name' | 'description'> | null;
}

// ---------------------------------------------------------------------------
// Payments (Phase 4)
// ---------------------------------------------------------------------------

export type PaymentStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type RefundStatus = 'pending' | 'succeeded' | 'failed';

/** Statuses from which a payment can no longer be started or cancelled. */
export const SETTLED_PAYMENT_STATUSES: readonly PaymentStatus[] = [
  'succeeded',
  'refunded',
  'partially_refunded',
];

export interface Payment {
  id: string;
  booking_id: string;
  customer_id: string;
  vendor_id: string;
  /** Integer MINOR units (paise). Bookings store rupees; payments store paise. */
  amount_minor: number;
  currency: string;
  amount_refunded_minor: number;
  status: PaymentStatus;
  provider: string;
  provider_payment_id: string | null;
  /** When the payment was handed to the provider. Staleness is measured here. */
  processing_since: string | null;
  idempotency_key: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface Refund {
  id: string;
  payment_id: string;
  amount_minor: number;
  reason: string | null;
  status: RefundStatus;
  provider_refund_id: string | null;
  idempotency_key: string;
  initiated_by: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Reviews (Phase 5)
// ---------------------------------------------------------------------------

/**
 * A review, as any client can read it.
 *
 * customer_id is absent by design: it is an auth.users UUID and no client role
 * holds a column privilege on it (migration 20260919000006). Reviews are shown
 * without attribution.
 */
export interface Review {
  id: string;
  booking_id: string;
  vendor_id: string;
  /** Whole stars, 1-5. vendors.rating is the mean of these. */
  rating: number;
  body: string | null;
  created_at: string;
  updated_at: string;
}
