import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Daily capacity, through the vendor dashboard.
 *
 * The rule is enforced in the database (tests/booking-capacity.test.ts proves
 * it, including under concurrency). This proves what a vendor sees: an
 * acceptance over the limit is refused with the reason, and raising
 * "Bookings per day" in the profile lets the next one through.
 *
 * Requires `npx supabase start`. Playwright starts the preview server itself
 * and points it at the local stack.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'e2e-password-12345';

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

async function createUser(label: string) {
  const email = `e2e-cap-${label}-${Date.now()}-${Math.floor(Math.random() * 1e4)}@ocasio.test`;
  const { data, error } = await admin().auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error) throw new Error(`could not create e2e user: ${error.message}`);
  const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  await client.auth.signInWithPassword({ email, password: PASSWORD });
  return { id: data.user!.id, email, client };
}

async function signIn(page: Page, email: string) {
  await page.goto('/auth');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).not.toHaveURL(/\/auth/);
}

const acceptedCount = async (vendorId: string) => {
  const { count } = await admin()
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('vendor_id', vendorId)
    .eq('status', 'accepted');
  return count ?? 0;
};

test.describe('vendor daily capacity', () => {
  test.describe.configure({ mode: 'serial' });

  let owner: Awaited<ReturnType<typeof createUser>>;
  let customers: Awaited<ReturnType<typeof createUser>>[] = [];
  let vendorId: string;

  test.beforeAll(async () => {
    owner = await createUser('owner');
    const { data: vendor, error } = await owner.client.rpc('request_vendor_onboarding', {
      p_business_name: `E2E Capacity Hall ${Date.now()}`,
      p_category: 'Venues',
      p_location: 'Pune',
    });
    if (error) throw new Error(`onboarding failed: ${error.message}`);
    vendorId = vendor.id;
    const a = admin();
    await a.from('vendors').update({ status: 'active', starting_price: 80_000 }).eq('id', vendorId);
    await a.from('profiles').update({ role: 'vendor' }).eq('id', owner.id);
    const { data: service } = await a
      .from('vendor_services')
      .insert({ vendor_id: vendorId, name: 'Banquet hall, full day', price: 80_000 })
      .select()
      .single();

    // Two different customers want the same date.
    const date = new Date(Date.now() + 500 * 86_400_000).toISOString().slice(0, 10);
    customers = [await createUser('cust-a'), await createUser('cust-b')];
    for (const customer of customers) {
      const { error: bookingError } = await customer.client.rpc('create_booking', {
        p_vendor_service_id: service!.id,
        p_event_date: date,
        p_event_location: 'Koregaon Park, Pune',
      });
      if (bookingError) throw new Error(`booking failed: ${bookingError.message}`);
    }
  });

  test.afterAll(async () => {
    const a = admin();
    await a.from('bookings').delete().eq('vendor_id', vendorId);
    await a.from('vendor_services').delete().eq('vendor_id', vendorId);
    await a.from('vendors').delete().eq('id', vendorId);
    await Promise.all([owner, ...customers].map((u) => a.auth.admin.deleteUser(u.id)));
  });

  test('at its daily limit, a vendor is told why an acceptance was refused', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Bookings', exact: true }).click();

    const accept = page.getByRole('button', { name: 'Accept' });
    await expect(accept).toHaveCount(2);

    await accept.first().click();
    await expect(page.getByTestId('booking-status').filter({ hasText: 'Accepted by vendor' })).toHaveCount(1);
    await expect(accept).toHaveCount(1);

    await accept.click();
    await expect(page.getByRole('alert')).toContainText(/daily limit/i);
    await expect(page.getByRole('alert')).toContainText(/raise your daily limit in your profile/i);
    expect(await acceptedCount(vendorId)).toBe(1);
  });

  test('raising "Bookings per day" lets the second booking through', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Edit profile' }).click();

    const capacity = page.getByLabel('Bookings per day');
    await expect(capacity).toHaveValue('1');
    await capacity.fill('2');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.getByRole('button', { name: 'Bookings', exact: true }).click();
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(page.getByTestId('booking-status').filter({ hasText: 'Accepted by vendor' })).toHaveCount(2);
    expect(await acceptedCount(vendorId)).toBe(2);
  });

  test('the form refuses a limit outside 1–100 before saving', async ({ page }) => {
    await signIn(page, owner.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await page.getByRole('button', { name: 'Edit profile' }).click();

    await page.getByLabel('Bookings per day').fill('0');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByText('Enter a whole number from 1 to 100.')).toBeVisible();

    const { data } = await admin().from('vendors').select('daily_capacity').eq('id', vendorId).single();
    expect(data!.daily_capacity).toBe(2);
  });
});
