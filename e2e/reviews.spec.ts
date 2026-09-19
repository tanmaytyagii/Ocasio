import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase 5 review flow, end to end in a real browser.
 *
 *   book -> vendor accepts -> vendor completes -> customer reviews
 *   -> review shows on the booking and on the vendor's public profile
 *   -> the form is gone, and a second review is impossible
 *
 * Also checks that the form is not offered before completion, and that the
 * vendor never gets one for their own business.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const PASSWORD = 'e2e-password-12345';

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function createUser(tag: string) {
  const email = `e2e-rev-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ocasio.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create user: ${error.message}`);
  return { id: data.user!.id, email };
}

async function createVendor(tag: string) {
  const owner = await createUser(`vendor-${tag}`);
  const a = admin();

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: owner.email, password: PASSWORD });

  const businessName = `E2E Review Vendor ${tag} ${Date.now()}`;
  const { data: vendor, error } = await client.rpc('request_vendor_onboarding', {
    p_business_name: businessName,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await a.from('vendors').update({ status: 'active', starting_price: 40_000 }).eq('id', vendor.id);
  await a.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await a
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: 'Event Catering', price: 90_000 })
    .select()
    .single();

  return {
    owner,
    vendorId: vendor.id,
    slug: vendor.slug as string,
    serviceId: service!.id,
    businessName,
  };
}

async function cleanup(vendorId: string, userIds: string[]) {
  const a = admin();
  const { data: payments } = await a.from('payments').select('id').eq('vendor_id', vendorId);
  const ids = (payments ?? []).map((p) => p.id);
  if (ids.length) {
    await a.from('refunds').delete().in('payment_id', ids);
    await a.from('payment_events').delete().in('payment_id', ids);
    await a.from('payments').delete().in('id', ids);
  }
  await a.from('reviews').delete().eq('vendor_id', vendorId);
  await a.from('bookings').delete().eq('vendor_id', vendorId);
  await a.from('vendor_services').delete().eq('vendor_id', vendorId);
  await a.from('vendors').delete().eq('id', vendorId);
  for (const id of userIds) await a.auth.admin.deleteUser(id);
}

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/auth/);
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

async function signOut(page: Page) {
  // Always sign out from a known page so the helper does not depend on which
  // route the test happens to be on.
  await page.goto('/');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

/** Books, accepts, and returns the booking URL. Optionally completes it. */
async function bookThrough(
  page: Page,
  vendor: Awaited<ReturnType<typeof createVendor>>,
  customerEmail: string,
  days: number,
  complete: boolean,
): Promise<string> {
  await page.goto('/auth');
  await signIn(page, customerEmail);

  await page.goto(`/vendors/${vendor.slug}`);
  await page.getByRole('button', { name: 'Request a booking' }).click();
  await page.getByLabel('Event date').fill(futureDate(days));
  await page.getByLabel('Event location').fill('Bandra, Mumbai');
  await page.getByRole('button', { name: 'Send booking request' }).click();
  await page.getByRole('link', { name: 'View this request' }).click();
  const bookingUrl = page.url();

  await signOut(page);
  await page.goto('/auth');
  await signIn(page, vendor.owner.email);
  await page.goto('/vendor/dashboard');
  await page.getByRole('button', { name: 'Bookings' }).click();
  await page.getByRole('button', { name: 'Accept' }).first().click();
  await expect(page.getByTestId('booking-status').first()).toHaveText('Accepted by vendor');

  if (complete) {
    await page.getByRole('button', { name: 'Mark completed' }).first().click();
    await expect(page.getByTestId('booking-status').first()).toHaveText('Completed');
  }

  return bookingUrl;
}

test.describe('review flow', () => {
  let vendor: Awaited<ReturnType<typeof createVendor>>;
  let customer: { id: string; email: string };

  test.beforeAll(async () => {
    vendor = await createVendor('flow');
    customer = await createUser('cust');
  });

  test.afterAll(async () => {
    await cleanup(vendor.vendorId, [vendor.owner.id, customer.id]);
  });

  test('customer reviews a completed booking, and it appears publicly', async ({ page }) => {
    const bookingUrl = await bookThrough(page, vendor, customer.email, 500, true);

    // --- Customer leaves a review ----------------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);

    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    await page.getByRole('radio', { name: '4 stars' }).click();
    await page.getByLabel(/Your review/).fill('Turned up on time and the food was excellent.');
    await page.getByRole('button', { name: 'Submit review' }).click();

    // --- It renders, and the form is gone --------------------------------
    await expect(page.getByTestId('booking-review')).toBeVisible();
    await expect(page.getByText('Turned up on time and the food was excellent.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);
    await expect(page.getByText(/cannot be edited or removed/i)).toBeVisible();

    // --- It survives a reload --------------------------------------------
    await page.reload();
    await expect(page.getByTestId('booking-review')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);

    // --- And appears on the public vendor profile, signed out -------------
    await signOut(page);
    await page.goto(`/vendors/${vendor.slug}`);
    await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
    await expect(page.getByText('Turned up on time and the food was excellent.')).toBeVisible();
    // The aggregate now reflects the single 4-star review.
    await expect(page.getByText(/4\.0 · 1 review/)).toBeVisible();
  });
});

test.describe('review eligibility in the UI', () => {
  let vendor: Awaited<ReturnType<typeof createVendor>>;
  let customer: { id: string; email: string };

  test.beforeAll(async () => {
    vendor = await createVendor('elig');
    customer = await createUser('eligcust');
  });

  test.afterAll(async () => {
    await cleanup(vendor.vendorId, [vendor.owner.id, customer.id]);
  });

  test('an accepted but not completed booking offers no review form', async ({ page }) => {
    const bookingUrl = await bookThrough(page, vendor, customer.email, 510, false);

    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);

    // The panel is hidden entirely until there is something to say.
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);
  });

  test('the vendor never gets a review form for their own business', async ({ page }) => {
    const bookingUrl = await bookThrough(page, vendor, customer.email, 511, true);

    // Still signed in as the vendor after completing it.
    await page.goto(bookingUrl);
    await expect(page.getByRole('heading', { name: 'Review', exact: true })).toBeVisible();
    await expect(page.getByText('This booking has not been reviewed.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit review' })).toHaveCount(0);
  });

  test('a vendor with no reviews says so on its public profile', async ({ page }) => {
    const fresh = await createVendor('empty');
    try {
      await page.goto(`/vendors/${fresh.slug}`);
      await expect(page.getByRole('heading', { name: 'Reviews' })).toBeVisible();
      await expect(page.getByText(/No written reviews yet/i)).toBeVisible();
    } finally {
      await cleanup(fresh.vendorId, [fresh.owner.id]);
    }
  });
});
