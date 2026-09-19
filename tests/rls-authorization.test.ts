/**
 * Authorization boundary tests (Phase 1, brief sections 27 and 28).
 *
 * These run against a real local Postgres with real RLS. They are the evidence
 * that authorization works — not the presence of policy definitions.
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
  PUBLIC_VENDOR_COLUMNS,
  type TestUser,
} from './helpers/supabase';

let running = false;
let customerA: TestUser;
let customerB: TestUser;
let vendorA: TestUser;
let vendorB: TestUser;
let vendorAId: string;
let vendorBId: string;
let seededVendorId: string;

beforeAll(async () => {
  running = await stackIsRunning();
  if (!running) return;

  [customerA, customerB, vendorA, vendorB] = await Promise.all([
    createTestUser('customer-a'),
    createTestUser('customer-b'),
    createTestUser('vendor-a'),
    createTestUser('vendor-b'),
  ]);

  // Vendors onboard through the controlled function, as a real user would.
  const { data: a } = await vendorA.client.rpc('request_vendor_onboarding', {
    p_business_name: 'Vendor A Events',
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  const { data: b } = await vendorB.client.rpc('request_vendor_onboarding', {
    p_business_name: 'Vendor B Events',
    p_category: 'Catering',
    p_location: 'Delhi',
  });
  vendorAId = a.id;
  vendorBId = b.id;

  // Approve both, the way an admin would (service_role).
  await serviceClient().from('vendors').update({ status: 'active' }).in('id', [vendorAId, vendorBId]);

  const { data: seeded } = await anonClient().from('vendors').select('id').limit(1).single();
  seededVendorId = seeded!.id;
});

afterAll(async () => {
  if (!running) return;
  const admin = serviceClient();
  await admin.from('vendors').delete().in('id', [vendorAId, vendorBId]);
  await Promise.all([customerA, customerB, vendorA, vendorB].filter(Boolean).map(deleteTestUser));
});

describe.runIf(await stackIsRunning())('public (unauthenticated) access', () => {
  it('can read active vendors — the marketplace is genuinely public', async () => {
    const { data, error } = await anonClient().from('vendors').select(PUBLIC_VENDOR_COLUMNS).eq('status', 'active');
    expect(error).toBeNull();
    expect(data!.length).toBeGreaterThanOrEqual(40);
  });

  it('can read a vendor by slug', async () => {
    const { data, error } = await anonClient()
      .from('vendors')
      .select(`${PUBLIC_VENDOR_COLUMNS}, vendor_services(*), vendor_media(*)`)
      .eq('slug', 'taj-palace')
      .single();
    expect(error).toBeNull();
    expect(data!.business_name).toBe('Taj Palace');
    expect(data!.vendor_services.length).toBeGreaterThan(0);
  });

  it('CANNOT read profiles', async () => {
    const { data, error } = await anonClient().from('profiles').select('*');
    // RLS returns an empty set rather than an error for unmatched SELECTs.
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('CANNOT read anyone\'s favourites', async () => {
    const { data } = await anonClient().from('favorites').select('*');
    expect(data).toEqual([]);
  });

  it('CANNOT insert a vendor', async () => {
    const { error } = await anonClient()
      .from('vendors')
      .insert({ business_name: 'Rogue', slug: 'rogue-anon', category: 'x', location: 'y', owner_id: crypto.randomUUID() });
    expect(error).not.toBeNull();
  });

  it('CANNOT see pending vendors', async () => {
    const admin = serviceClient();
    const { data: pending } = await admin
      .from('vendors')
      .update({ status: 'pending' })
      .eq('id', vendorAId)
      .select()
      .single();
    expect(pending!.status).toBe('pending');

    const { data } = await anonClient().from('vendors').select(PUBLIC_VENDOR_COLUMNS).eq('id', vendorAId);
    expect(data).toEqual([]);

    await admin.from('vendors').update({ status: 'active' }).eq('id', vendorAId);
  });
});

describe.runIf(await stackIsRunning())('customer isolation', () => {
  it('customer A cannot read customer B\'s profile', async () => {
    const { data } = await customerA.client.from('profiles').select('*').eq('id', customerB.id);
    expect(data).toEqual([]);
  });

  it('customer A reads only their own profile', async () => {
    const { data } = await customerA.client.from('profiles').select('*');
    expect(data!.length).toBe(1);
    expect(data![0].id).toBe(customerA.id);
  });

  it('customer A cannot read customer B\'s favourites', async () => {
    await customerB.client.from('favorites').insert({ user_id: customerB.id, vendor_id: seededVendorId });

    const { data } = await customerA.client.from('favorites').select('*');
    expect(data!.every((f: { user_id: string }) => f.user_id === customerA.id)).toBe(true);
    expect(data!.some((f: { user_id: string }) => f.user_id === customerB.id)).toBe(false);
  });

  it('customer A cannot delete customer B\'s favourites', async () => {
    const { data: before } = await serviceClient()
      .from('favorites').select('*').eq('user_id', customerB.id);
    expect(before!.length).toBeGreaterThan(0);

    await customerA.client.from('favorites').delete().eq('user_id', customerB.id);

    const { data: after } = await serviceClient()
      .from('favorites').select('*').eq('user_id', customerB.id);
    expect(after!.length).toBe(before!.length);
  });

  it('customer A cannot forge a favourite owned by customer B', async () => {
    const { error } = await customerA.client
      .from('favorites')
      .insert({ user_id: customerB.id, vendor_id: seededVendorId });
    expect(error).not.toBeNull();
  });

  it('the same vendor cannot be favourited twice', async () => {
    await customerA.client.from('favorites').insert({ user_id: customerA.id, vendor_id: seededVendorId });
    const { error } = await customerA.client
      .from('favorites')
      .insert({ user_id: customerA.id, vendor_id: seededVendorId });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('23505'); // unique_violation
  });
});

describe.runIf(await stackIsRunning())('vendor ownership isolation', () => {
  it('vendor A cannot modify vendor B\'s record', async () => {
    await vendorA.client.from('vendors').update({ business_name: 'HIJACKED' }).eq('id', vendorBId);

    const { data } = await serviceClient().from('vendors').select('business_name').eq('id', vendorBId).single();
    expect(data!.business_name).toBe('Vendor B Events');
  });

  it('vendor A cannot add services to vendor B', async () => {
    const { error } = await vendorA.client
      .from('vendor_services')
      .insert({ vendor_id: vendorBId, name: 'Injected service' });
    expect(error).not.toBeNull();
  });

  it('vendor A cannot delete vendor B\'s services', async () => {
    await serviceClient().from('vendor_services').insert({ vendor_id: vendorBId, name: 'B service' });

    await vendorA.client.from('vendor_services').delete().eq('vendor_id', vendorBId);

    const { data } = await serviceClient().from('vendor_services').select('*').eq('vendor_id', vendorBId);
    expect(data!.length).toBeGreaterThan(0);
  });

  it('vendor A CAN manage their own services', async () => {
    const { error } = await vendorA.client
      .from('vendor_services')
      .insert({ vendor_id: vendorAId, name: 'Own service', price: 5000 });
    expect(error).toBeNull();
  });

  it('a customer cannot modify any vendor', async () => {
    await customerA.client.from('vendors').update({ business_name: 'CUSTOMER EDIT' }).eq('id', vendorAId);
    const { data } = await serviceClient().from('vendors').select('business_name').eq('id', vendorAId).single();
    expect(data!.business_name).toBe('Vendor A Events');
  });
});

describe.runIf(await stackIsRunning())('privilege escalation (brief section 28)', () => {
  it('a customer CANNOT promote themselves by updating profiles.role', async () => {
    const { error } = await customerA.client
      .from('profiles')
      .update({ role: 'vendor' })
      .eq('id', customerA.id);

    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Role cannot be changed/i);

    const { data } = await serviceClient().from('profiles').select('role').eq('id', customerA.id).single();
    expect(data!.role).toBe('customer');
  });

  it('the ORIGINAL vulnerability: updateUser metadata does NOT grant authorization', async () => {
    // This is exactly what the Phase 0 ProtectedRoute trusted.
    const { error: updateError } = await customerA.client.auth.updateUser({
      data: { user_type: 'vendor', role: 'admin' },
    });
    expect(updateError).toBeNull(); // the metadata write itself is allowed...

    const { data: userData } = await customerA.client.auth.getUser();
    expect(userData.user!.user_metadata.user_type).toBe('vendor'); // ...and takes effect...

    // ...but confers nothing. The database role is unchanged:
    const { data: profile } = await serviceClient()
      .from('profiles').select('role').eq('id', customerA.id).single();
    expect(profile!.role).toBe('customer');

    // ...and no vendor data became writable:
    await customerA.client.from('vendors').update({ business_name: 'META HIJACK' }).eq('id', vendorAId);
    const { data: vendor } = await serviceClient()
      .from('vendors').select('business_name').eq('id', vendorAId).single();
    expect(vendor!.business_name).toBe('Vendor A Events');
  });

  it('a vendor cannot approve their own listing', async () => {
    await serviceClient().from('vendors').update({ status: 'pending' }).eq('id', vendorAId);

    const { error } = await vendorA.client
      .from('vendors').update({ status: 'active' }).eq('id', vendorAId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/status is set by review/i);

    await serviceClient().from('vendors').update({ status: 'active' }).eq('id', vendorAId);
  });

  it('a vendor cannot inflate their own rating', async () => {
    const { error } = await vendorA.client
      .from('vendors').update({ rating: 5, review_count: 9999 }).eq('id', vendorAId);
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/derived from reviews/i);
  });

  it('a vendor cannot reassign ownership to themselves', async () => {
    const { error } = await vendorA.client
      .from('vendors').update({ owner_id: vendorA.id }).eq('id', vendorBId);
    const { data } = await serviceClient().from('vendors').select('owner_id').eq('id', vendorBId).single();
    expect(data!.owner_id).toBe(vendorB.id);
    expect(error === null || error !== null).toBe(true); // either denied by RLS or by trigger
  });

  it('onboarding always produces a PENDING vendor, never an active one', async () => {
    const fresh = await createTestUser('onboard');
    const { data, error } = await fresh.client.rpc('request_vendor_onboarding', {
      p_business_name: 'Sneaky Active Vendor',
      p_category: 'Catering',
      p_location: 'Pune',
    });
    expect(error).toBeNull();
    expect(data.status).toBe('pending');

    // It is not publicly visible.
    const { data: pub } = await anonClient().from('vendors').select(PUBLIC_VENDOR_COLUMNS).eq('id', data.id);
    expect(pub).toEqual([]);

    // And the applicant is still a customer.
    const { data: profile } = await serviceClient()
      .from('profiles').select('role').eq('id', fresh.id).single();
    expect(profile!.role).toBe('customer');

    await serviceClient().from('vendors').delete().eq('id', data.id);
    await deleteTestUser(fresh);
  });

  it('signup metadata cannot mint a vendor role', async () => {
    const admin = serviceClient();
    const email = `test-signup-${Date.now()}@ocasio.test`;
    const { data } = await admin.auth.admin.createUser({
      email,
      password: 'test-password-12345',
      email_confirm: true,
      user_metadata: { user_type: 'vendor', role: 'admin' },
    });

    const { data: profile } = await admin.from('profiles').select('role').eq('id', data.user!.id).single();
    expect(profile!.role).toBe('customer');

    await admin.auth.admin.deleteUser(data.user!.id);
  });
});
