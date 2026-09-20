/**
 * Vendor moderation boundary tests (Phase A).
 *
 * moderate_vendor() is the only path that changes vendors.status, so these are
 * the evidence that it cannot be abused — not the presence of an `is_admin()`
 * check in the source.
 *
 * Everything here runs against real Postgres with real RLS. The admin role is
 * granted through the service client, because a user cannot grant it to
 * themselves; that restriction is itself asserted below.
 *
 * Run: npx supabase start && npm run test
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestUser, deleteTestUser, serviceClient, stackIsRunning, type TestUser } from './helpers/supabase';

let running = false;
let admin: TestUser;
let applicant: TestUser;
let bystander: TestUser;
let applicantVendorId: string;

beforeAll(async () => {
  running = await stackIsRunning();
  if (!running) return;

  [admin, applicant, bystander] = await Promise.all([
    createTestUser('mod-admin'),
    createTestUser('mod-applicant'),
    createTestUser('mod-bystander'),
  ]);

  // Only the service role can mint an admin. A user promoting themselves is
  // asserted to fail further down.
  await serviceClient().from('profiles').update({ role: 'admin' }).eq('id', admin.id);

  const { data, error } = await applicant.client.rpc('request_vendor_onboarding', {
    p_business_name: 'Moderation Fixture Events',
    p_category: 'Catering',
    p_location: 'Mumbai',
    p_phone: '+91 90000 00000',
  });
  if (error) throw new Error(`fixture onboarding failed: ${error.message}`);
  applicantVendorId = (data as { id: string }).id;
}, 60000);

afterAll(async () => {
  if (!running) return;
  const svc = serviceClient();
  await svc.from('vendors').delete().eq('id', applicantVendorId);
  await Promise.all([
    deleteTestUser(admin),
    deleteTestUser(applicant),
    deleteTestUser(bystander),
  ]);
});

const maybe = (name: string, fn: () => Promise<void>) =>
  it(name, async () => {
    if (!running) return;
    await fn();
  }, 30000);

describe('onboarding creates a pending vendor and nothing more', () => {
  maybe('the applied-for vendor starts pending, never active', async () => {
    const { data } = await serviceClient()
      .from('vendors')
      .select('status, owner_id')
      .eq('id', applicantVendorId)
      .single();

    expect(data!.status).toBe('pending');
    expect(data!.owner_id).toBe(applicant.id);
  });

  maybe('a pending vendor is invisible to the public marketplace', async () => {
    const { data } = await bystander.client.rpc('search_vendors', {
      p_query: 'Moderation Fixture Events',
      p_limit: 20,
      p_offset: 0,
    });
    const ids = (data ?? []).map((r: { id: string }) => r.id);
    expect(ids).not.toContain(applicantVendorId);
  });

  maybe('a second application from the same user is refused', async () => {
    const { error } = await applicant.client.rpc('request_vendor_onboarding', {
      p_business_name: 'Second Business',
      p_category: 'Venues',
      p_location: 'Delhi',
    });
    expect(error).not.toBeNull();
  });
});

describe('self-approval is impossible', () => {
  maybe('the owner cannot set their own status to active', async () => {
    const { error } = await applicant.client
      .from('vendors')
      .update({ status: 'active' })
      .eq('id', applicantVendorId);

    expect(error).not.toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('status')
      .eq('id', applicantVendorId)
      .single();
    expect(data!.status).toBe('pending');
  });

  maybe('the owner cannot call moderate_vendor on themselves', async () => {
    const { error } = await applicant.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'approve',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/not authoris/i);
  });

  maybe('a user cannot promote themselves to admin', async () => {
    await applicant.client.from('profiles').update({ role: 'admin' }).eq('id', applicant.id);

    const { data } = await serviceClient()
      .from('profiles')
      .select('role')
      .eq('id', applicant.id)
      .single();
    expect(data!.role).not.toBe('admin');
  });
});

describe('the moderation queue is admin-only', () => {
  maybe('a non-admin gets an empty queue, not another user\'s data', async () => {
    const { data, error } = await bystander.client.rpc('admin_list_vendors', {});
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  maybe('an admin sees the pending application', async () => {
    const { data, error } = await admin.client.rpc('admin_list_vendors', {
      p_status: 'pending',
    });
    expect(error).toBeNull();

    const row = (data ?? []).find((v: { id: string }) => v.id === applicantVendorId) as
      | { business_name: string; owner_email: string }
      | undefined;

    expect(row).toBeDefined();
    expect(row!.business_name).toBe('Moderation Fixture Events');
    expect(row!.owner_email).toBe(applicant.email);
  });

  maybe('is_admin() reports false for a normal user', async () => {
    const { data } = await bystander.client.rpc('is_admin');
    expect(data).toBe(false);
  });
});

describe('moderate_vendor changes status and nothing else', () => {
  maybe('a non-admin cannot moderate anyone', async () => {
    const { error } = await bystander.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'approve',
    });
    expect(error).not.toBeNull();
  });

  maybe('an admin can approve, and the vendor becomes publicly visible', async () => {
    const { error } = await admin.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'approve',
    });
    expect(error).toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('status')
      .eq('id', applicantVendorId)
      .single();
    expect(data!.status).toBe('active');
  });

  maybe('approving preserves owner_id, rating and review_count', async () => {
    const { data } = await serviceClient()
      .from('vendors')
      .select('owner_id, rating, review_count, business_name')
      .eq('id', applicantVendorId)
      .single();

    expect(data!.owner_id).toBe(applicant.id);
    expect(Number(data!.rating)).toBe(0);
    expect(data!.review_count).toBe(0);
    expect(data!.business_name).toBe('Moderation Fixture Events');
  });

  maybe('the decision is recorded in the audit log', async () => {
    const { data } = await serviceClient()
      .from('audit_log')
      .select('action, actor_id, actor_role, entity_type, metadata')
      .eq('entity_id', applicantVendorId)
      .order('created_at', { ascending: false });

    const approved = (data ?? []).find(
      (r: { action: string }) => r.action === 'vendor.approved',
    ) as
      | { actor_id: string; actor_role: string; entity_type: string; metadata: Record<string, string> }
      | undefined;

    expect(approved).toBeDefined();
    expect(approved!.actor_id).toBe(admin.id);
    expect(approved!.actor_role).toBe('admin');
    expect(approved!.entity_type).toBe('vendor');
    expect(approved!.metadata.from_status).toBe('pending');
    expect(approved!.metadata.to_status).toBe('active');
  });

  maybe('re-applying the same action is refused', async () => {
    const { error } = await admin.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'approve',
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/already in that state/i);
  });

  maybe('an unknown action is refused', async () => {
    const { error } = await admin.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'delete_everything',
    });
    expect(error).not.toBeNull();
  });

  maybe('an admin can suspend an active vendor, removing it from search', async () => {
    const { error } = await admin.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'suspend',
      p_note: 'Test suspension',
    });
    expect(error).toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('status')
      .eq('id', applicantVendorId)
      .single();
    expect(data!.status).toBe('suspended');

    const { data: results } = await bystander.client.rpc('search_vendors', {
      p_query: 'Moderation Fixture Events',
      p_limit: 20,
      p_offset: 0,
    });
    expect((results ?? []).map((r: { id: string }) => r.id)).not.toContain(applicantVendorId);
  });

  maybe('the suspension note reaches the audit log', async () => {
    const { data } = await serviceClient()
      .from('audit_log')
      .select('action, metadata')
      .eq('entity_id', applicantVendorId)
      .eq('action', 'vendor.suspended');

    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data![0] as { metadata: Record<string, string> }).metadata.note).toBe('Test suspension');
  });

  maybe('a suspended vendor can be reinstated', async () => {
    const { error } = await admin.client.rpc('moderate_vendor', {
      p_vendor_id: applicantVendorId,
      p_action: 'reinstate',
    });
    expect(error).toBeNull();

    const { data } = await serviceClient()
      .from('vendors')
      .select('status')
      .eq('id', applicantVendorId)
      .single();
    expect(data!.status).toBe('active');
  });

  maybe('moderating a vendor that does not exist is refused', async () => {
    const { error } = await admin.client.rpc('moderate_vendor', {
      p_vendor_id: '00000000-0000-0000-0000-000000000000',
      p_action: 'approve',
    });
    expect(error).not.toBeNull();
  });

  maybe('the escape hatch does not leak — the owner still cannot change status', async () => {
    const { error } = await applicant.client
      .from('vendors')
      .update({ status: 'pending' })
      .eq('id', applicantVendorId);
    expect(error).not.toBeNull();
  });
});
