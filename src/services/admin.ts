/**
 * Moderation data access.
 *
 * Both calls land on SECURITY DEFINER functions that re-derive the caller's
 * role from public.profiles. Nothing here is an authorization check — a user
 * who called these directly from a console would get an empty list and a
 * "Not authorised" error, because the decision is made in Postgres.
 */
import { supabase } from '../lib/supabase';
import type { VendorStatus } from '../types/database';

export interface ModerationVendor {
  id: string;
  business_name: string;
  slug: string;
  category: string;
  location: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  status: VendorStatus;
  created_at: string;
  updated_at: string;
  owner_id: string;
  owner_email: string | null;
  service_count: number;
}

export type ModerationAction = 'approve' | 'reject' | 'suspend' | 'reinstate';

function fail(context: string, error: { message: string }): never {
  console.error(`[ocasio] ${context}:`, error.message);
  throw new Error(context);
}

/** The moderation queue. Returns [] for a non-admin rather than throwing. */
export async function listVendorsForModeration(
  status?: VendorStatus,
  query?: string,
): Promise<ModerationVendor[]> {
  const { data, error } = await supabase.rpc('admin_list_vendors', {
    p_status: status ?? null,
    p_query: query?.trim() || null,
  });

  if (error) fail('Unable to load vendor applications', error);
  return (data ?? []) as ModerationVendor[];
}

/**
 * Applies a moderation decision.
 *
 * The thrown messages are written for the reviewer, not copied from Postgres —
 * raw database text is neither useful to them nor safe to surface.
 */
export async function moderateVendor(
  vendorId: string,
  action: ModerationAction,
  note?: string,
): Promise<ModerationVendor> {
  const { data, error } = await supabase.rpc('moderate_vendor', {
    p_vendor_id: vendorId,
    p_action: action,
    p_note: note?.trim() || null,
  });

  if (error) {
    console.error('[ocasio] moderate_vendor:', error.message);

    if (/not authoris/i.test(error.message)) {
      throw new Error('You do not have permission to moderate vendors.');
    }
    if (/already in that state/i.test(error.message)) {
      throw new Error('That vendor is already in this state — refresh to see the latest.');
    }
    if (/not found/i.test(error.message)) {
      throw new Error('That vendor no longer exists.');
    }
    throw new Error('We could not apply that decision. Please try again.');
  }

  return data as ModerationVendor;
}
