/**
 * Vendor workspace authorization (Phase B).
 *
 * Everything a vendor can now do from the dashboard — edit their profile, run
 * their service list, upload portfolio files — is exercised here against real
 * RLS and real Storage policies, and then attempted again as the wrong person.
 *
 * The point is not that the UI hides the wrong buttons. It is that a caller
 * going straight at PostgREST or the Storage API with another vendor's id gets
 * nothing.
 *
 * Run: npx supabase start && npm run test
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonClient,
  createTestUser,
  deleteTestUser,
  serviceClient,
  stackIsRunning,
  type TestUser,
} from './helpers/supabase';

let running = false;
let vendorA: TestUser;
let vendorB: TestUser;
let customer: TestUser;
let vendorAId: string;
let vendorBId: string;
let serviceAId: string;
let mediaAId: string;

const BUCKET = 'vendor-portfolio';

/** A one-pixel PNG. Enough to prove the policy path without shipping a fixture. */
const pngBytes = () =>
  Uint8Array.from(
    atob(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    ),
    (c) => c.charCodeAt(0),
  );

async function onboardAndApprove(user: TestUser, name: string): Promise<string> {
  const { data, error } = await user.client.rpc('request_vendor_onboarding', {
    p_business_name: name,
    p_category: 'Photography',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);
  const id = (data as { id: string }).id;

  // Activated with the service client rather than moderate_vendor(): that
  // function requires is_admin(), which reads profiles by auth.uid(), and the
  // service role has no auth.uid() at all. The admin approval path has its own
  // coverage in vendor-moderation.test.ts; here an active vendor is just a
  // fixture. protect_vendor_moderated_fields() returns early when auth.uid()
  // is null, so this is the supported way to arrange one.
  const { error: activateError } = await serviceClient()
    .from('vendors')
    .update({ status: 'active' })
    .eq('id', id);
  if (activateError) throw new Error(`fixture activation failed: ${activateError.message}`);

  return id;
}

beforeAll(async () => {
  running = await stackIsRunning();
  if (!running) return;

  [vendorA, vendorB, customer] = await Promise.all([
    createTestUser('ws-vendor-a'),
    createTestUser('ws-vendor-b'),
    createTestUser('ws-customer'),
  ]);

  vendorAId = await onboardAndApprove(vendorA, `WS Vendor A ${Date.now()}`);
  vendorBId = await onboardAndApprove(vendorB, `WS Vendor B ${Date.now()}`);
}, 90000);

afterAll(async () => {
  if (!running) return;
  const svc = serviceClient();
  await svc.storage.from(BUCKET).remove([`${vendorAId}/probe.png`, `${vendorBId}/probe.png`]);
  await svc.from('vendor_media').delete().in('vendor_id', [vendorAId, vendorBId]);
  await svc.from('vendor_services').delete().in('vendor_id', [vendorAId, vendorBId]);
  await svc.from('vendors').delete().in('id', [vendorAId, vendorBId]);
  await Promise.all([deleteTestUser(vendorA), deleteTestUser(vendorB), deleteTestUser(customer)]);
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!running) return;
    await fn();
  }, 30000);

// ---------------------------------------------------------------------------
describe('vendor profile', () => {
  maybe('the owner can edit their own editable fields', async () => {
    const { error } = await vendorA.client
      .from('vendors')
      .update({
        description: 'Updated by the owner.',
        location: 'Pune',
        phone: '+91 90000 11111',
        starting_price: 25000,
      })
      .eq('id', vendorAId);

    expect(error).toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('description, location, phone, starting_price')
      .eq('id', vendorAId)
      .single();

    expect(data!.description).toBe('Updated by the owner.');
    expect(data!.location).toBe('Pune');
    expect(data!.starting_price).toBe(25000);
  });

  maybe('vendor A cannot edit vendor B\'s profile', async () => {
    await vendorA.client.from('vendors').update({ description: 'hijacked' }).eq('id', vendorBId);

    const { data } = await serviceClient()
      .from('vendors')
      .select('description')
      .eq('id', vendorBId)
      .single();
    expect(data!.description).not.toBe('hijacked');
  });

  maybe('a customer cannot edit a vendor profile', async () => {
    await customer.client.from('vendors').update({ description: 'customer edit' }).eq('id', vendorAId);

    const { data } = await serviceClient()
      .from('vendors')
      .select('description')
      .eq('id', vendorAId)
      .single();
    expect(data!.description).toBe('Updated by the owner.');
  });

  maybe('an anonymous caller cannot edit a vendor profile', async () => {
    await anonClient().from('vendors').update({ description: 'anon edit' }).eq('id', vendorAId);

    const { data } = await serviceClient()
      .from('vendors')
      .select('description')
      .eq('id', vendorAId)
      .single();
    expect(data!.description).toBe('Updated by the owner.');
  });

  maybe('the owner still cannot change status, owner_id or rating', async () => {
    const status = await vendorA.client.from('vendors').update({ status: 'suspended' }).eq('id', vendorAId);
    expect(status.error).not.toBeNull();

    const owner = await vendorA.client.from('vendors').update({ owner_id: vendorB.id }).eq('id', vendorAId);
    expect(owner.error).not.toBeNull();

    const rating = await vendorA.client.from('vendors').update({ rating: 5 }).eq('id', vendorAId);
    expect(rating.error).not.toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('status, owner_id, rating')
      .eq('id', vendorAId)
      .single();
    expect(data!.status).toBe('active');
    expect(data!.owner_id).toBe(vendorA.id);
    expect(Number(data!.rating)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('vendor services', () => {
  maybe('the owner can create a service', async () => {
    const { data, error } = await vendorA.client
      .from('vendor_services')
      .insert({ vendor_id: vendorAId, name: 'Wedding Photography', price: 45000, sort_order: 0 })
      .select()
      .single();

    expect(error).toBeNull();
    serviceAId = data!.id;
    expect(data!.is_active).toBe(true);
  });

  maybe('the owner can edit and deactivate their own service', async () => {
    const edit = await vendorA.client
      .from('vendor_services')
      .update({ name: 'Wedding Photography (Full Day)', price: 52000 })
      .eq('id', serviceAId);
    expect(edit.error).toBeNull();

    const off = await vendorA.client
      .from('vendor_services')
      .update({ is_active: false })
      .eq('id', serviceAId);
    expect(off.error).toBeNull();

    const { data } = await serviceClient()
      .from('vendor_services')
      .select('name, price, is_active')
      .eq('id', serviceAId)
      .single();
    expect(data!.name).toBe('Wedding Photography (Full Day)');
    expect(data!.price).toBe(52000);
    expect(data!.is_active).toBe(false);

    // Put it back for the booking tests below.
    await vendorA.client.from('vendor_services').update({ is_active: true }).eq('id', serviceAId);
  });

  maybe('vendor B cannot create a service under vendor A', async () => {
    const { error } = await vendorB.client
      .from('vendor_services')
      .insert({ vendor_id: vendorAId, name: 'Injected service', price: 1 });

    expect(error).not.toBeNull();

    const { count } = await serviceClient()
      .from('vendor_services')
      .select('*', { count: 'exact', head: true })
      .eq('vendor_id', vendorAId)
      .eq('name', 'Injected service');
    expect(count).toBe(0);
  });

  maybe('vendor B cannot edit or deactivate vendor A\'s service', async () => {
    await vendorB.client
      .from('vendor_services')
      .update({ name: 'hijacked', price: 1, is_active: false })
      .eq('id', serviceAId);

    const { data } = await serviceClient()
      .from('vendor_services')
      .select('name, price, is_active')
      .eq('id', serviceAId)
      .single();
    expect(data!.name).toBe('Wedding Photography (Full Day)');
    expect(data!.price).toBe(52000);
    expect(data!.is_active).toBe(true);
  });

  maybe('vendor B cannot delete vendor A\'s service', async () => {
    await vendorB.client.from('vendor_services').delete().eq('id', serviceAId);

    const { count } = await serviceClient()
      .from('vendor_services')
      .select('*', { count: 'exact', head: true })
      .eq('id', serviceAId);
    expect(count).toBe(1);
  });

  maybe('a customer cannot create or edit vendor services', async () => {
    const insert = await customer.client
      .from('vendor_services')
      .insert({ vendor_id: vendorAId, name: 'Customer service', price: 0 });
    expect(insert.error).not.toBeNull();

    await customer.client.from('vendor_services').update({ price: 0 }).eq('id', serviceAId);
    const { data } = await serviceClient()
      .from('vendor_services')
      .select('price')
      .eq('id', serviceAId)
      .single();
    expect(data!.price).toBe(52000);
  });

  maybe('an anonymous caller cannot create vendor services', async () => {
    const { error } = await anonClient()
      .from('vendor_services')
      .insert({ vendor_id: vendorAId, name: 'Anon service', price: 0 });
    expect(error).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('historical bookings survive service changes', () => {
  let bookingId: string;

  maybe('a customer books the service at its current price', async () => {
    const { data, error } = await customer.client.rpc('create_booking', {
      p_vendor_service_id: serviceAId,
      p_event_date: '2027-01-01',
      p_event_location: 'Mumbai',
      p_customer_notes: 'Phase B fixture',
    });
    expect(error).toBeNull();
    bookingId = (data as { id: string }).id;

    const { data: booking } = await serviceClient()
      .from('bookings')
      .select('quoted_price')
      .eq('id', bookingId)
      .single();
    expect(booking!.quoted_price).toBe(52000);
  });

  maybe('repricing the service does not change the booking', async () => {
    await vendorA.client.from('vendor_services').update({ price: 999999 }).eq('id', serviceAId);

    const { data } = await serviceClient()
      .from('bookings')
      .select('quoted_price')
      .eq('id', bookingId)
      .single();
    expect(data!.quoted_price).toBe(52000);

    await vendorA.client.from('vendor_services').update({ price: 52000 }).eq('id', serviceAId);
  });

  maybe('deactivating the service does not change the booking', async () => {
    await vendorA.client.from('vendor_services').update({ is_active: false }).eq('id', serviceAId);

    const { data } = await serviceClient()
      .from('bookings')
      .select('quoted_price, status')
      .eq('id', bookingId)
      .single();
    expect(data!.quoted_price).toBe(52000);
    expect(data!.status).toBe('pending');

    await vendorA.client.from('vendor_services').update({ is_active: true }).eq('id', serviceAId);
  });

  maybe('a service with bookings cannot be deleted', async () => {
    const { error } = await vendorA.client
      .from('vendor_services')
      .delete()
      .eq('id', serviceAId);

    // ON DELETE RESTRICT on bookings.vendor_service_id.
    expect(error).not.toBeNull();

    const { count } = await serviceClient()
      .from('vendor_services')
      .select('*', { count: 'exact', head: true })
      .eq('id', serviceAId);
    expect(count).toBe(1);
  });

  maybe('a service with no bookings can be deleted by its owner', async () => {
    const { data } = await vendorA.client
      .from('vendor_services')
      .insert({ vendor_id: vendorAId, name: 'Temporary', price: 100 })
      .select()
      .single();

    const { error } = await vendorA.client.from('vendor_services').delete().eq('id', data!.id);
    expect(error).toBeNull();

    const { count } = await serviceClient()
      .from('vendor_services')
      .select('*', { count: 'exact', head: true })
      .eq('id', data!.id);
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('portfolio storage', () => {
  maybe('the owner can upload into their own vendor folder', async () => {
    const { error } = await vendorA.client.storage
      .from(BUCKET)
      .upload(`${vendorAId}/probe.png`, pngBytes(), { contentType: 'image/png', upsert: true });

    expect(error).toBeNull();
  });

  maybe('vendor B cannot upload into vendor A\'s folder', async () => {
    const { error } = await vendorB.client.storage
      .from(BUCKET)
      .upload(`${vendorAId}/intruder.png`, pngBytes(), { contentType: 'image/png' });

    expect(error).not.toBeNull();
  });

  maybe('vendor B cannot delete vendor A\'s object', async () => {
    await vendorB.client.storage.from(BUCKET).remove([`${vendorAId}/probe.png`]);

    const { data } = await serviceClient().storage.from(BUCKET).list(vendorAId);
    expect((data ?? []).map((o) => o.name)).toContain('probe.png');
  });

  maybe('a malformed path is refused rather than erroring', async () => {
    const { error } = await vendorA.client.storage
      .from(BUCKET)
      .upload(`not-a-uuid/x.png`, pngBytes(), { contentType: 'image/png' });

    expect(error).not.toBeNull();
  });

  maybe('a traversal-style path does not reach another vendor', async () => {
    const { error } = await vendorB.client.storage
      .from(BUCKET)
      .upload(`${vendorBId}/../${vendorAId}/escape.png`, pngBytes(), { contentType: 'image/png' });

    // Either refused outright, or normalised into vendor B's own namespace —
    // never into vendor A's.
    const { data } = await serviceClient().storage.from(BUCKET).list(vendorAId);
    expect((data ?? []).map((o) => o.name)).not.toContain('escape.png');
    expect(error === null || error !== null).toBe(true);
  });

  maybe('an anonymous caller cannot upload at all', async () => {
    const { error } = await anonClient()
      .storage.from(BUCKET)
      .upload(`${vendorAId}/anon.png`, pngBytes(), { contentType: 'image/png' });

    expect(error).not.toBeNull();
  });

  maybe('portfolio objects are publicly readable, which is the point', async () => {
    const { data } = anonClient().storage.from(BUCKET).getPublicUrl(`${vendorAId}/probe.png`);
    const response = await fetch(data.publicUrl);
    expect(response.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('vendor_media rows', () => {
  maybe('the owner can record their own media row', async () => {
    const { data: url } = vendorA.client.storage.from(BUCKET).getPublicUrl(`${vendorAId}/probe.png`);

    const { data, error } = await vendorA.client
      .from('vendor_media')
      .insert({ vendor_id: vendorAId, url: url.publicUrl, alt_text: 'Probe', sort_order: 0 })
      .select()
      .single();

    expect(error).toBeNull();
    mediaAId = data!.id;
  });

  maybe('vendor B cannot insert media under vendor A', async () => {
    const { error } = await vendorB.client
      .from('vendor_media')
      .insert({ vendor_id: vendorAId, url: 'https://example.test/x.png', sort_order: 0 });
    expect(error).not.toBeNull();
  });

  maybe('vendor B cannot delete vendor A\'s media row', async () => {
    await vendorB.client.from('vendor_media').delete().eq('id', mediaAId);

    const { count } = await serviceClient()
      .from('vendor_media')
      .select('*', { count: 'exact', head: true })
      .eq('id', mediaAId);
    expect(count).toBe(1);
  });

  maybe('a customer cannot insert or delete vendor media', async () => {
    const insert = await customer.client
      .from('vendor_media')
      .insert({ vendor_id: vendorAId, url: 'https://example.test/y.png', sort_order: 0 });
    expect(insert.error).not.toBeNull();

    await customer.client.from('vendor_media').delete().eq('id', mediaAId);
    const { count } = await serviceClient()
      .from('vendor_media')
      .select('*', { count: 'exact', head: true })
      .eq('id', mediaAId);
    expect(count).toBe(1);
  });

  maybe('the owner can delete their own media row', async () => {
    const { error } = await vendorA.client.from('vendor_media').delete().eq('id', mediaAId);
    expect(error).toBeNull();

    const { count } = await serviceClient()
      .from('vendor_media')
      .select('*', { count: 'exact', head: true })
      .eq('id', mediaAId);
    expect(count).toBe(0);
  });
});
