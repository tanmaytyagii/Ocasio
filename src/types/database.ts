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
