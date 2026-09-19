/**
 * Database row types.
 *
 * Kept hand-written and deliberately minimal for Phase 1. `supabase gen types`
 * requires either a running local stack or a linked remote project, so
 * committing generated types would make the build depend on infrastructure that
 * contributors may not have running.
 *
 * `npm run db:types` regenerates the full generated file into
 * src/types/supabase.generated.ts once a local stack is up. Phase 2 can switch
 * to it wholesale; these aliases exist so call sites do not have to change when
 * that happens.
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

export interface VendorService {
  id: string;
  vendor_id: string;
  name: string;
  description: string | null;
  price: number | null;
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
export interface VendorWithDetails extends Vendor {
  vendor_services: VendorService[];
  vendor_media: VendorMedia[];
}
