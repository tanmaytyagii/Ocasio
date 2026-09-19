/**
 * Favourites data access.
 *
 * RLS restricts every statement to the caller's own rows, and the
 * (user_id, vendor_id) unique constraint makes double-favouriting impossible at
 * the database level rather than in UI state.
 *
 * UI state lives in FavoritesContext, which is the single store. These
 * functions are the persistence layer beneath it.
 */
import { supabase } from '../lib/supabase';
import type { PublicVendor } from '../types/database';

const VENDOR_COLUMNS =
  'id, slug, business_name, description, category, location, status, phone, email, website, business_hours, hero_image_url, rating, review_count, starting_price, created_at, updated_at';

function fail(context: string, error: { message: string }): never {
  console.error(`[ocasio] ${context}:`, error.message);
  throw new Error(context);
}

/** The signed-in user's saved vendors, newest first. */
export async function listMyFavoriteVendors(): Promise<PublicVendor[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select(`vendor_id, created_at, vendors(${VENDOR_COLUMNS})`)
    .order('created_at', { ascending: false });

  if (error) fail('Unable to load your saved vendors', error);

  // PostgREST embeds a to-one relationship as an object, but the untyped client
  // widens it. Normalise both shapes rather than asserting one.
  return (data ?? []).flatMap((row) => {
    const embedded = (row as unknown as { vendors: PublicVendor | PublicVendor[] | null }).vendors;
    if (!embedded) return [];
    return Array.isArray(embedded) ? embedded : [embedded];
  });
}

/** Just the ids, for the shared favourite store. */
export async function listMyFavoriteIds(): Promise<string[]> {
  const { data, error } = await supabase.from('favorites').select('vendor_id');
  if (error) fail('Unable to load your saved vendors', error);
  return (data ?? []).map((r: { vendor_id: string }) => r.vendor_id);
}
