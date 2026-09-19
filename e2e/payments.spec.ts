import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase 4 payment lifecycle, end to end in a real browser.
 *
 *   discover -> book -> vendor accepts -> customer pays
 *   -> provider confirms via webhook -> paid
 *   -> vendor refunds -> refunded
 *
 * and the failure path:
 *
 *   pay -> provider rejects via webhook -> failed, booking still unpaid
 *
 * The settlement step is driven through the webhook processor under the
 * service role, exactly as a real provider would reach it. It is deliberately
 * NOT driven through the UI: the browser cannot settle a payment, and a test
 * that pretended otherwise would be testing itself.
 *
 * No external payment API is contacted.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const PASSWORD = 'e2e-password-12345';
const SERVICE_PRICE = 60_000; // rupees

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

const futureDate = (days: number) =>
  new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

async function createUser(tag: string) {
  const email = `e2e-pay-${tag}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ocasio.test`;
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

  const businessName = `E2E Pay Vendor ${tag} ${Date.now()}`;
  const { data: vendor, error } = await client.rpc('request_vendor_onboarding', {
    p_business_name: businessName,
    p_category: 'Catering',
    p_location: 'Mumbai',
  });
  if (error) throw new Error(`onboarding failed: ${error.message}`);

  await a.from('vendors').update({ status: 'active', starting_price: 30_000 }).eq('id', vendor.id);
  await a.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);

  const { data: service } = await a
    .from('vendor_services')
    .insert({ vendor_id: vendor.id, name: 'Premium Catering', price: SERVICE_PRICE })
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
  // /vendor/dashboard has no navbar; move to a page that does.
  await page.goto('/');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

/** Books a service and has the vendor accept it. Returns the booking URL. */
async function bookAndAccept(
  page: Page,
  vendor: Awaited<ReturnType<typeof createVendor>>,
  customerEmail: string,
  days: number,
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
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByTestId('booking-status').first()).toHaveText('Accepted by vendor');

  return bookingUrl;
}

/** Delivers a provider event the way the real webhook path would. */
async function deliverPaymentEvent(bookingId: string, eventType: string) {
  const a = admin();
  const { data: payment } = await a
    .from('payments')
    .select('provider_payment_id')
    .eq('booking_id', bookingId)
    .single();

  const { error } = await a.rpc('process_payment_event', {
    p_provider: 'test',
    p_provider_event_id: `evt_${eventType}_${Date.now()}_${Math.random()}`,
    p_event_type: eventType,
    p_provider_payment_id: payment!.provider_payment_id,
    p_signature_verified: true,
  });
  if (error) throw new Error(`webhook delivery failed: ${error.message}`);
}

const bookingIdFrom = (url: string) => url.split('/bookings/')[1];

test.describe('payment lifecycle', () => {
  let vendor: Awaited<ReturnType<typeof createVendor>>;
  let customer: { id: string; email: string };

  test.beforeAll(async () => {
    vendor = await createVendor('life');
    customer = await createUser('cust');
  });

  test.afterAll(async () => {
    await cleanup(vendor.vendorId, [vendor.owner.id, customer.id]);
  });

  test('customer pays, provider confirms, vendor refunds', async ({ page }) => {
    const bookingUrl = await bookAndAccept(page, vendor, customer.email, 300);
    const bookingId = bookingIdFrom(bookingUrl);

    // --- Customer pays ---------------------------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);

    await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
    await expect(page.getByText('No payment has been started')).toBeVisible();

    await page.getByRole('button', { name: 'Pay this booking' }).click();

    // Handed to the provider, NOT paid. The UI must not claim otherwise.
    await expect(page.getByTestId('payment-status')).toHaveText('Awaiting payment confirmation');
    await expect(page.getByText(/not confirmed until they tell us it settled/i)).toBeVisible();

    // The amount is the server-derived snapshot, in rupees.
    await expect(page.getByTestId('payment-amount')).toHaveText(
      `₹${SERVICE_PRICE.toLocaleString('en-IN')}`,
    );

    // --- Provider confirms, via the webhook path -------------------------
    await deliverPaymentEvent(bookingId, 'payment.succeeded');
    await page.reload();
    await expect(page.getByTestId('payment-status')).toHaveText('Paid');

    // --- Vendor sees it as paid and refunds ------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, vendor.owner.email);
    await page.goto(bookingUrl);
    await expect(page.getByTestId('payment-status')).toHaveText('Paid');

    await expect(page.getByRole('heading', { name: 'Issue a refund' })).toBeVisible();
    await page.getByLabel('Amount (₹)').fill(String(SERVICE_PRICE));
    await page.getByLabel(/Reason/).fill('Vendor withdrew');
    await page.getByRole('button', { name: 'Issue refund' }).click();

    await expect(page.getByText('Refund requested')).toBeVisible();

    // The provider settles the refund.
    const a = admin();
    const { data: payment } = await a
      .from('payments')
      .select('id')
      .eq('booking_id', bookingId)
      .single();
    const { data: refund } = await a
      .from('refunds')
      .select('id')
      .eq('payment_id', payment!.id)
      .single();
    await a.rpc('process_refund_event', {
      p_refund_id: refund!.id,
      p_provider_event_id: `rev_${Date.now()}`,
      p_event_type: 'refund.succeeded',
      p_provider_refund_id: `pr_${refund!.id}`,
      p_signature_verified: true,
    });

    await page.reload();
    await expect(page.getByTestId('payment-status')).toHaveText('Refunded');

    // --- Customer sees the same final state ------------------------------
    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);
    await expect(page.getByTestId('payment-status')).toHaveText('Refunded');
    // Customers never get a refund control.
    await expect(page.getByRole('heading', { name: 'Issue a refund' })).toHaveCount(0);
  });
});

test.describe('payment failure', () => {
  let vendor: Awaited<ReturnType<typeof createVendor>>;
  let customer: { id: string; email: string };

  test.beforeAll(async () => {
    vendor = await createVendor('fail');
    customer = await createUser('failcust');
  });

  test.afterAll(async () => {
    await cleanup(vendor.vendorId, [vendor.owner.id, customer.id]);
  });

  test('a rejected payment leaves the booking accepted and retryable', async ({ page }) => {
    const bookingUrl = await bookAndAccept(page, vendor, customer.email, 310);
    const bookingId = bookingIdFrom(bookingUrl);

    await signOut(page);
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(bookingUrl);

    await page.getByRole('button', { name: 'Pay this booking' }).click();
    await expect(page.getByTestId('payment-status')).toHaveText('Awaiting payment confirmation');

    await deliverPaymentEvent(bookingId, 'payment.failed');
    await page.reload();

    await expect(page.getByTestId('payment-status')).toHaveText('Payment failed');
    // The booking itself is untouched by a failed payment.
    await expect(page.getByTestId('booking-status').first()).toHaveText('Accepted by vendor');
    // And the customer can try again.
    await expect(page.getByRole('button', { name: 'Pay this booking' })).toBeVisible();
  });
});
