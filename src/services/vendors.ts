/**
 * Vendor data access.
 *
 * The one place that talks to Supabase about vendors. Components call these
 * functions; they do not build queries themselves. Kept as plain async
 * functions — no repository classes, no query-builder abstraction.
 *
 * Every read here is additionally constrained by RLS, so the `.eq('status',
 * 'active')` filters below are for correctness and index use, not security.
 * Removing them would not expose non-active vendors.
 */
import { supabase } from '../lib/supabase';
import type { Vendor, VendorWithDetails } from '../types/database';

export interface VendorFilters {
  category?: string;
  location?: string;
  query?: string;
  limit?: number;
}

/** Public vendor listing. Requires no authentication. */
export async function listVendors(filters: VendorFilters = {}): Promise<Vendor[]> {
  let q = supabase.from('vendors').select('*').eq('status', 'active');

  if (filters.category) q = q.ilike('category', filters.category);
  if (filters.location) q = q.ilike('location', filters.location);
  if (filters.query) {
    const term = `%${filters.query}%`;
    q = q.or(
      `business_name.ilike.${term},description.ilike.${term},category.ilike.${term},location.ilike.${term}`,
    );
  }

  const { data, error } = await q
    .order('rating', { ascending: false })
    .limit(filters.limit ?? 60);

  if (error) throw new Error(`Could not load vendors: ${error.message}`);
  return data ?? [];
}

/** Public vendor detail, resolved by stable slug. */
export async function getVendorBySlug(slug: string): Promise<VendorWithDetails | null> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*, vendor_services(*), vendor_media(*)')
    .eq('slug', slug)
    .eq('status', 'active')
    .maybeSingle();

  if (error) throw new Error(`Could not load vendor: ${error.message}`);
  if (!data) return null;

  const vendor = data as VendorWithDetails;
  vendor.vendor_services = [...(vendor.vendor_services ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  vendor.vendor_media = [...(vendor.vendor_media ?? [])].sort(
    (a, b) => a.sort_order - b.sort_order,
  );
  return vendor;
}

/** Highest-rated active vendors, for the homepage. */
export async function listFeaturedVendors(limit = 3): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('status', 'active')
    .order('rating', { ascending: false })
    .order('review_count', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load featured vendors: ${error.message}`);
  return data ?? [];
}
