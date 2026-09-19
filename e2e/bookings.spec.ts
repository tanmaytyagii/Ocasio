import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * The Phase 3 booking lifecycle, end to end in a real browser.
 *
 *   signed-out visitor opens a vendor and tries to book -> sent to sign in
 *   -> customer selects a service and submits -> appears in /bookings
 *   -> vendor sees the request, accepts -> customer sees accepted
 *   -> vendor completes -> customer sees completed
 *
 * Plus a separate cancellation flow and an authorisation check that one
 * customer cannot open another's booking by URL.
 *
 * No payment step is exercised because none exists.
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

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}

async function createUser(tag: string): Promise<{ id: string; email: string }> {
  const email = `e2e-bk-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ocasio.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create user: ${error.message}`);
  return { id: data.user!.id, email };
}

/** An approved vendor with one priced, bookable service. */
async function createVendor(tag: string) {
  const owner = await createUser(`vendor-${tag}`);
  const a = admin();

  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: owner.email, password: PASSWORD });

  const businessName = `E2E Vendor ${tag} ${Date.now()}`;
  const { data: vendor, error } = await client.rpc('request_vendor_onboarding', {
    p_business_name: businessName,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await a.from('vendors').update({ status: 'active', starting_price: 60000 }).eq('id', vendor.id);
  await a.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await a
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: 'Full Wedding Catering', price: 125000 })
    .select()
    .single();

  return { owner, vendorId: vendor.id, slug: vendor.slug as string, serviceId: service!.id, businessName };
}

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the sign-in to land. Navigating immediately after the click races
  // it, and the next page then renders as a signed-out visitor.
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

test.describe('booking lifecycle', () => {
  let vendor: Awaited<ReturnType<typeof createVendor>>;
  let customer: { id: string; email: string };

  test.beforeAll(async () => {
    vendor = await createVendor('life');
    customer = await createUser('cust');
  });

  test.afterAll(async () => {
    const a = admin();
    await a.from('bookings').delete().eq('vendor_id', vendor.vendorId);
    await a.from('vendors').delete().eq('id', vendor.vendorId);
    await a.auth.admin.deleteUser(vendor.owner.id);
    await a.auth.admin.deleteUser(customer.id);
  });

  test('customer requests a booking, vendor accepts then completes it', async ({ page }) => {
    // --- Signed out: booking requires an account ------------------------
    await page.goto(`/vendors/${vendor.slug}`);
    await expect(page.getByRole('heading', { name: vendor.businessName })).toBeVisible();

    await page.getByRole('button', { name: 'Request a booking' }).click();
    await expect(page.getByRole('heading', { name: 'Request a booking' })).toBeVisible();

    await page.getByRole('button', { name: /Sign in to request a booking/ }).click();
    await expect(page).toHaveURL(/\/auth/);

    // --- Sign in and submit ----------------------------------------------
    await signIn(page, customer.email);
    await expect(page).toHaveURL(new RegExp(`/vendors/${vendor.slug}`));

    await page.getByRole('button', { name: 'Request a booking' }).click();

    // The vendor has exactly one bookable service.
    await page.getByLabel('Service').selectOption({ index: 0 });
    await page.getByLabel('Event date').fill(futureDate(45));
    await page.getByLabel('Event location').fill('Bandra, Mumbai');
    await page.getByLabel(/Anything the vendor should know/).fill('220 guests, evening service');

    // The quote is read-only and derived from the service price. Targeted by
    // test id because the same figure also appears in the service option and
    // the vendor's service list.
    await expect(page.getByTestId('booking-quote')).toHaveText('₹1,25,000');

    await page.getByRole('button', { name: 'Send booking request' }).click();

    // --- Confirmation is a request, not a booking or a payment ------------
    await expect(page.getByRole('heading', { name: 'Booking request submitted' })).toBeVisible();
    await expect(page.getByText(/not a confirmed booking, and no payment has been taken/i)).toBeVisible();

    // --- It appears in /bookings -----------------------------------------
    await page.getByRole('link', { name: 'All my bookings' }).click();
    await expect(page).toHaveURL(/\/bookings$/);
    await expect(page.getByRole('heading', { name: vendor.businessName })).toBeVisible();
    await expect(page.getByTestId('booking-status').first()).toHaveText('Pending vendor response');

    // --- Detail page shows pending and the opening history entry ----------
    await page.getByRole('link', { name: new RegExp(vendor.businessName) }).first().click();
    await expect(page).toHaveURL(/\/bookings\/[0-9a-f-]{36}$/);
    const bookingUrl = page.url();

    await expect(page.getByTestId('booking-status').first()).toHaveText('Pending vendor response');
    await expect(page.getByRole('heading', { name: 'Status history' })).toBeVisible();
    await expect(page.getByText('Request submitted')).toBeVisible();

    // --- Vendor accepts ---------------------------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, vendor.owner.email);

    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Bookings' }).click();
    await expect(page.getByRole('heading', { name: 'Booking requests' })).toBeVisible();
    await expect(page.getByText('220 guests, evening service')).toBeVisible();

    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByTestId('booking-status').first()).toHaveText('Accepted by vendor');

    // --- Customer sees accepted -------------------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);
    await expect(page.getByTestId('booking-status').first()).toHaveText('Accepted by vendor');
    await expect(page.getByText('Accepted by vendor').last()).toBeVisible(); // history entry

    // --- Vendor completes --------------------------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, vendor.owner.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Bookings' }).click();
    await page.getByRole('button', { name: 'Mark completed' }).click();
    await expect(page.getByTestId('booking-status').first()).toHaveText('Completed');

    // --- Customer sees completed, and can no longer cancel -----------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);
    await expect(page.getByTestId('booking-status').first()).toHaveText('Completed');
    await expect(page.getByRole('button', { name: 'Cancel this booking' })).toHaveCount(0);
  });
});

test.describe('booking cancellation and access control', () => {
  let vendor: Awaited<ReturnType<typeof createVendor>>;
  let customer: { id: string; email: string };
  let stranger: { id: string; email: string };

  test.beforeAll(async () => {
    vendor = await createVendor('cancel');
    customer = await createUser('cust2');
    stranger = await createUser('stranger');
  });

  test.afterAll(async () => {
    const a = admin();
    await a.from('bookings').delete().eq('vendor_id', vendor.vendorId);
    await a.from('vendors').delete().eq('id', vendor.vendorId);
    await a.auth.admin.deleteUser(vendor.owner.id);
    await a.auth.admin.deleteUser(customer.id);
    await a.auth.admin.deleteUser(stranger.id);
  });

  test('a customer can cancel a pending booking', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, customer.email);

    await page.goto(`/vendors/${vendor.slug}`);
    await page.getByRole('button', { name: 'Request a booking' }).click();
    await page.getByLabel('Event date').fill(futureDate(60));
    await page.getByLabel('Event location').fill('Pune');
    await page.getByRole('button', { name: 'Send booking request' }).click();

    await page.getByRole('link', { name: 'View this request' }).click();
    await expect(page.getByTestId('booking-status').first()).toHaveText('Pending vendor response');

    await page.getByRole('button', { name: 'Cancel this booking' }).click();
    await expect(page.getByTestId('booking-status').first()).toHaveText('Cancelled');

    // Terminal: the cancel action is gone.
    await expect(page.getByRole('button', { name: 'Cancel this booking' })).toHaveCount(0);
  });

  test('another customer cannot open someone else\'s booking by URL', async ({ page }) => {
    // Arrange a booking owned by `customer`, directly.
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: customer.email, password: PASSWORD });
    const { data: booking } = await client.rpc('create_booking', {
      p_vendor_service_id: vendor.serviceId,
      p_event_date: futureDate(90),
      p_event_location: 'Goa',
    });

    await page.goto('/auth');
    await signIn(page, stranger.email);

    await page.goto(`/bookings/${booking.id}`);
    // RLS returns nothing, so the page renders not-found rather than leaking.
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('a signed-out visitor cannot reach the bookings pages', async ({ page }) => {
    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/auth/);
  });
});
