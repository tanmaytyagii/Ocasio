/**
 * Vendor data access.
 *
 * The one place that talks to Supabase about vendors. Components call these
 * functions; they do not build queries themselves.
 *
 * Column lists are explicit, never `*`. Two reasons:
 *  - anon holds column-level SELECT on vendors, not table-level, so `*` would
 *    request owner_id and fail (migration 20260919000003).
 *  - it keeps search_vector and internal columns off the wire.
 *
 * Reads are additionally bounded by RLS, so the status filters below are for
 * correctness and index use, not security.
 */
import { supabase } from '../lib/supabase';
import type {
  CategoryCount,
  FilterOptions,
  PublicVendor,
  VendorSearchResult,
  VendorSort,
  VendorWithDetails,
} from '../types/database';

/** Every publicly readable vendor column. Mirrors the grant in migration 3. */
const PUBLIC_VENDOR_COLUMNS =
  'id, slug, business_name, description, category, location, status, phone, email, website, business_hours, hero_image_url, rating, review_count, starting_price, created_at, updated_at';

export interface VendorSearchParams {
  query?: string;
  category?: string;
  location?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  service?: string;
  sort?: VendorSort;
  page?: number;
  pageSize?: number;
}

export interface VendorSearchResponse {
  vendors: VendorSearchResult[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Wraps a Supabase error so raw database text never reaches the user. */
function fail(context: string, error: { message: string }): never {
  // Technical detail stays in the console for developers.
  console.error(`[ocasio] ${context}:`, error.message);
  throw new Error(context);
}

/**
 * Paginated marketplace search. Filtering, sorting and pagination all happen
 * in Postgres via search_vendors(); nothing is filtered in React.
 */
export async function searchVendors(
  params: VendorSearchParams = {},
): Promise<VendorSearchResponse> {
  const page = Math.max(params.page ?? 1, 1);
  const pageSize = Math.min(Math.max(params.pageSize ?? 12, 1), 48);

  const { data, error } = await supabase.rpc('search_vendors', {
    p_query: params.query?.trim() || null,
    p_category: params.category || null,
    p_location: params.location || null,
    p_min_price: params.minPrice ?? null,
    p_max_price: params.maxPrice ?? null,
    p_min_rating: params.minRating ?? null,
    p_service: params.service || null,
    p_sort: params.sort ?? 'relevance',
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });

  if (error) fail('Unable to load vendors', error);

  const rows = (data ?? []) as VendorSearchResult[];
  // total_count is a window function, so every row carries the same value.
  const totalCount = rows.length > 0 ? Number(rows[0].total_count) : 0;

  return {
    vendors: rows,
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
  };
}

/** Public vendor detail, resolved by stable slug, with services and media. */
export async function getVendorBySlug(slug: string): Promise<VendorWithDetails | null> {
  const { data, error } = await supabase
    .from('vendors')
    .select(
      `${PUBLIC_VENDOR_COLUMNS}, vendor_services(id, vendor_id, name, description, price, sort_order, created_at, updated_at), vendor_media(id, vendor_id, url, alt_text, sort_order, created_at)`,
    )
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  if (error) fail('Unable to load this vendor', error);
  if (!data) return null;

  const vendor = data as unknown as VendorWithDetails;
  vendor.vendor_services = [...(vendor.vendor_services ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  vendor.vendor_media = [...(vendor.vendor_media ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  return vendor;
}

/**
 * Highest-rated active vendors, for the homepage.
 *
 * "Top rated" means exactly that: ordered by rating, then review count. There
 * is no promotion, boosting or paid placement.
 */
export async function listFeaturedVendors(limit = 3): Promise<PublicVendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select(PUBLIC_VENDOR_COLUMNS)
    .eq('status', 'active')
    .order('rating', { ascending: false })
    .order('review_count', { ascending: false })
    .limit(limit);

  if (error) fail('Unable to load featured vendors', error);
  return (data ?? []) as unknown as PublicVendor[];
}

/** Active vendor count per category, for the homepage tiles. */
export async function getCategoryCounts(): Promise<CategoryCount[]> {
  const { data, error } = await supabase.rpc('category_counts');
  if (error) fail('Unable to load categories', error);
  return (data ?? []) as CategoryCount[];
}

/** Real option lists and price bounds for the filter controls. */
export async function getFilterOptions(): Promise<FilterOptions> {
  const { data, error } = await supabase.rpc('filter_options');
  if (error) fail('Unable to load filters', error);
  return data as FilterOptions;
}
