/**
 * Profile data access.
 *
 * profiles.role is the authorization source of truth. It is read here and never
 * written: the profiles_no_self_role_change trigger rejects any client attempt
 * to change it, so there is deliberately no updateRole() function to call.
 */
import { supabase } from '../lib/supabase';
import type { Profile } from '../types/database';

/** The signed-in user's profile, or null when signed out. */
export async function getMyProfile(): Promise<Profile | null> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (error) throw new Error(`Could not load profile: ${error.message}`);
  return data;
}

/** Updates the caller's own editable profile fields. Role is not among them. */
export async function updateMyProfile(
  patch: Pick<Partial<Profile>, 'full_name' | 'avatar_url'>,
): Promise<Profile> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Not signed in.');

  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', auth.user.id)
    .select()
    .single();

  if (error) throw new Error(`Could not update profile: ${error.message}`);
  return data;
}
