/**
 * Vendor workspace data access — the owner's side of their own listing.
 *
 * Every call here is an ordinary PostgREST write bounded by policies that have
 * existed since migration 1: vendor_services and vendor_media carry
 * owner-scoped INSERT/UPDATE/DELETE via owns_vendor(), and vendors carries an
 * UPDATE policy of auth.uid() = owner_id. Nothing in this file decides who may
 * do what; it decides what the UI asks for.
 *
 * The vendor_id sent with a row is therefore a claim, not an authorisation.
 * Postgres re-derives ownership from the vendors table and refuses anything
 * that does not match — proven in tests/vendor-workspace.test.ts, which
 * attempts each of these operations as the wrong vendor.
 */
import { supabase } from '../lib/supabase';
import type { PublicVendor, VendorMedia, VendorService } from '../types/database';

export const PORTFOLIO_BUCKET = 'vendor-portfolio';

/** Mirrors the bucket's own allowed_mime_types and file_size_limit. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const PUBLIC_VENDOR_COLUMNS =
  'id, slug, business_name, description, category, location, status, phone, email, website, business_hours, hero_image_url, rating, review_count, rating_is_demo, starting_price, created_at, updated_at';

function fail(context: string, error: { message: string }): never {
  console.error(`[ocasio] ${context}:`, error.message);
  throw new Error(context);
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/**
 * The fields a vendor may change about themselves.
 *
 * Deliberately absent: status, owner_id, rating, review_count and
 * rating_is_demo, all of which protect_vendor_moderated_fields() refuses; and
 * slug, which is stable because it is the public URL of the listing and
 * existing links would break.
 */
export interface VendorProfilePatch {
  business_name: string;
  description: string | null;
  category: string;
  location: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  business_hours: string | null;
  starting_price: number | null;
  hero_image_url: string | null;
}

export async function updateMyVendor(
  vendorId: string,
  patch: Partial<VendorProfilePatch>,
): Promise<PublicVendor> {
  const { data, error } = await supabase
    .from('vendors')
    .update(patch)
    .eq('id', vendorId)
    .select(PUBLIC_VENDOR_COLUMNS)
    .single();

  if (error) {
    console.error('[ocasio] updateMyVendor:', error.message);
    if (/status is set by review/i.test(error.message)) {
      throw new Error('Listing status is set by Ocasio, not from this page.');
    }
    if (/ownership cannot be reassigned/i.test(error.message)) {
      throw new Error('Ownership cannot be changed.');
    }
    if (/vendors_name_length/i.test(error.message)) {
      throw new Error('Business name must be between 2 and 160 characters.');
    }
    throw new Error('We could not save your profile. Please try again.');
  }

  return data as PublicVendor;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

export interface ServiceInput {
  name: string;
  description: string | null;
  price: number | null;
  is_active: boolean;
}

/** Every service the owner has, active or not. Ordered as the vendor arranged them. */
export async function listMyServices(vendorId: string): Promise<VendorService[]> {
  const { data, error } = await supabase
    .from('vendor_services')
    .select('id, vendor_id, name, description, price, is_active, sort_order, created_at, updated_at')
    .eq('vendor_id', vendorId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) fail('Unable to load your services', error);
  return (data ?? []) as VendorService[];
}

export async function createService(
  vendorId: string,
  input: ServiceInput,
  sortOrder: number,
): Promise<VendorService> {
  const { data, error } = await supabase
    .from('vendor_services')
    .insert({ vendor_id: vendorId, sort_order: sortOrder, ...input })
    .select()
    .single();

  if (error) {
    console.error('[ocasio] createService:', error.message);
    if (/vendor_services_name_length/i.test(error.message)) {
      throw new Error('Service name must be between 1 and 160 characters.');
    }
    if (/vendor_services_price_pos/i.test(error.message)) {
      throw new Error('Price cannot be negative.');
    }
    throw new Error('We could not add that service. Please try again.');
  }

  return data as VendorService;
}

export async function updateService(
  serviceId: string,
  patch: Partial<ServiceInput>,
): Promise<VendorService> {
  const { data, error } = await supabase
    .from('vendor_services')
    .update(patch)
    .eq('id', serviceId)
    .select()
    .single();

  if (error) {
    console.error('[ocasio] updateService:', error.message);
    if (/vendor_services_name_length/i.test(error.message)) {
      throw new Error('Service name must be between 1 and 160 characters.');
    }
    if (/vendor_services_price_pos/i.test(error.message)) {
      throw new Error('Price cannot be negative.');
    }
    throw new Error('We could not save that service. Please try again.');
  }

  return data as VendorService;
}

/**
 * Deletes a service.
 *
 * bookings.vendor_service_id is ON DELETE RESTRICT, so a service that has ever
 * been booked cannot be removed — which is the point. Deleting it would leave
 * historical bookings pointing at nothing, and a customer's record of what they
 * paid for would lose its meaning. The caller is told to deactivate instead.
 */
export async function deleteService(serviceId: string): Promise<void> {
  const { error } = await supabase.from('vendor_services').delete().eq('id', serviceId);

  if (error) {
    console.error('[ocasio] deleteService:', error.message);
    if (/violates foreign key constraint|still referenced/i.test(error.message)) {
      throw new Error(
        'This service has bookings against it, so it cannot be deleted. Deactivate it instead — it will stop appearing to customers and existing bookings stay intact.',
      );
    }
    throw new Error('We could not delete that service. Please try again.');
  }
}

// ---------------------------------------------------------------------------
// Portfolio
// ---------------------------------------------------------------------------

export async function listMyMedia(vendorId: string): Promise<VendorMedia[]> {
  const { data, error } = await supabase
    .from('vendor_media')
    .select('id, vendor_id, url, alt_text, sort_order, created_at')
    .eq('vendor_id', vendorId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) fail('Unable to load your portfolio', error);
  return (data ?? []) as VendorMedia[];
}

const extensionFor = (type: string) =>
  ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif' })[type] ??
  'jpg';

/**
 * Uploads one portfolio image and records it.
 *
 * The object path is `{vendor_id}/{uuid}.{ext}`. The vendor id is the first
 * segment because the storage policy reads it back and checks it against
 * owns_vendor() — a caller who writes someone else's id there is refused. The
 * filename is generated rather than taken from the upload, so a hostile name
 * cannot traverse, collide, or carry a second extension.
 *
 * The checks below are for a decent error message. The real limits are on the
 * bucket, which refuses an oversized or wrong-typed file regardless of what
 * this function does.
 */
export async function uploadPortfolioImage(
  vendorId: string,
  file: File,
  altText: string,
  sortOrder: number,
): Promise<VendorMedia> {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    throw new Error('Choose a JPEG, PNG, WebP or AVIF image.');
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('That image is larger than 5 MB. Choose a smaller file.');
  }

  const path = `${vendorId}/${crypto.randomUUID()}.${extensionFor(file.type)}`;

  const { error: uploadError } = await supabase.storage
    .from(PORTFOLIO_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '3600' });

  if (uploadError) {
    console.error('[ocasio] uploadPortfolioImage:', uploadError.message);
    if (/exceeded the maximum allowed size/i.test(uploadError.message)) {
      throw new Error('That image is larger than 5 MB. Choose a smaller file.');
    }
    if (/mime type|not allowed/i.test(uploadError.message)) {
      throw new Error('Choose a JPEG, PNG, WebP or AVIF image.');
    }
    throw new Error('We could not upload that image. Please try again.');
  }

  const { data: urlData } = supabase.storage.from(PORTFOLIO_BUCKET).getPublicUrl(path);

  const { data, error } = await supabase
    .from('vendor_media')
    .insert({
      vendor_id: vendorId,
      url: urlData.publicUrl,
      alt_text: altText.trim() || null,
      sort_order: sortOrder,
    })
    .select()
    .single();

  if (error) {
    // The row is what makes the file visible, so an orphaned object is worse
    // than no upload: it counts against storage and shows nowhere.
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]);
    console.error('[ocasio] uploadPortfolioImage record:', error.message);
    throw new Error('We could not save that image. Please try again.');
  }

  return data as VendorMedia;
}

/** Removes the record and then the object it points at, in that order. */
export async function deletePortfolioImage(media: VendorMedia): Promise<void> {
  const { error } = await supabase.from('vendor_media').delete().eq('id', media.id);
  if (error) {
    console.error('[ocasio] deletePortfolioImage:', error.message);
    throw new Error('We could not remove that image. Please try again.');
  }

  // Best effort. A stranded object is invisible to everyone; a stranded row
  // would render a broken image, which is why the row goes first.
  const marker = `/${PORTFOLIO_BUCKET}/`;
  const index = media.url.indexOf(marker);
  if (index !== -1) {
    const path = media.url.slice(index + marker.length);
    await supabase.storage.from(PORTFOLIO_BUCKET).remove([path]);
  }
}
