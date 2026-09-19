/**
 * Favourites data access.
 *
 * RLS restricts every statement to the caller's own rows, and the
 * (user_id, vendor_id) unique constraint makes double-favouriting impossible at
 * the database level rather than in UI state.
 */
import { supabase } from '../lib/supabase';
import type { Favorite, Vendor } from '../types/database';

export async function listMyFavoriteVendors(): Promise<Vendor[]> {
  const { data, error } = await supabase
    .from('favorites')
    .select('vendor_id, vendors(*)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Could not load favourites: ${error.message}`);

  // PostgREST embeds a to-one relationship as an object, but the untyped client
  // widens it to unknown. Normalise both shapes rather than asserting one.
  return (data ?? []).flatMap((row) => {
    const embedded = (row as unknown as { vendors: Vendor | Vendor[] | null }).vendors;
    if (!embedded) return [];
    return Array.isArray(embedded) ? embedded : [embedded];
  });
}

export async function addFavorite(vendorId: string): Promise<Favorite> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to save vendors.');

  const { data, error } = await supabase
    .from('favorites')
    .insert({ user_id: auth.user.id, vendor_id: vendorId })
    .select()
    .single();

  if (error) throw new Error(`Could not save vendor: ${error.message}`);
  return data;
}

export async function removeFavorite(vendorId: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('vendor_id', vendorId);
  if (error) throw new Error(`Could not remove vendor: ${error.message}`);
}
