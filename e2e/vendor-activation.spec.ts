import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase B end-to-end: the supply activation journey.
 *
 * Applies, gets approved, then does the three things that previously required
 * SQL — edit the profile, add a priced service, upload a portfolio image — and
 * checks that a customer can then find the vendor and start a booking against
 * that exact service.
 *
 * The database is inspected between steps so a green UI cannot stand in for a
 * missing row or a missing object.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'e2e-password-12345';
const BUCKET = 'vendor-portfolio';

const admin = () =>
  createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function createUser(label: string, role?: 'admin') {
  const email = `e2e-${label}-${Date.now()}-${Math.floor(Math.random() * 10000)}@ocasio.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create e2e user: ${error.message}`);
  if (role) await admin().from('profiles').update({ role }).eq('id', data.user!.id);
  return { id: data.user!.id, email };
}

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 20000 });
}

/** A one-pixel PNG, written to disk so the file input has something real. */
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe.configure({ mode: 'serial' });

test.describe('vendor activation', () => {
  let vendorUser: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let customer: { id: string; email: string };
  let businessName: string;
  let vendorId: string;
  let slug: string;

  const SERVICE = 'Full Day Coverage';
  const PRICE = 64000;

  test.beforeAll(async () => {
    const scope = test.info().project.name;
    businessName = `Activation ${scope} ${Date.now()}`;

    [vendorUser, reviewer, customer] = await Promise.all([
      createUser(`act-vendor-${scope}`),
      createUser(`act-admin-${scope}`, 'admin'),
      createUser(`act-customer-${scope}`),
    ]);
  });

  test.afterAll(async () => {
    const svc = admin();
    if (vendorId) {
      const { data } = await svc.storage.from(BUCKET).list(vendorId);
      if (data?.length) {
        await svc.storage.from(BUCKET).remove(data.map((o) => `${vendorId}/${o.name}`));
      }
      await svc.from('bookings').delete().eq('vendor_id', vendorId);
      await svc.from('vendor_media').delete().eq('vendor_id', vendorId);
      await svc.from('vendor_services').delete().eq('vendor_id', vendorId);
      await svc.from('vendors').delete().eq('id', vendorId);
    }
    await Promise.all(
      [vendorUser, reviewer, customer].map((u) => svc.auth.admin.deleteUser(u.id)),
    );
  });

  test('vendor applies and an admin approves', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, vendorUser.email);
    await page.goto('/become-vendor');

    await page.getByLabel('Business name').fill(businessName);
    await page.getByLabel('Category').selectOption('Photography');
    await page.getByLabel('City').fill('Mumbai');
    await page.getByRole('button', { name: 'Submit application' }).click();
    await expect(page.getByRole('heading', { name: /has been submitted/i })).toBeVisible();

    const { data } = await admin()
      .from('vendors')
      .select('id, slug, status')
      .eq('business_name', businessName)
      .single();
    vendorId = data!.id;
    slug = data!.slug;
    expect(data!.status).toBe('pending');

    // Approve through the console, not with SQL.
    const reviewerPage = await page.context().browser()!.newPage();
    await reviewerPage.goto('/auth');
    await signIn(reviewerPage, reviewer.email);
    await reviewerPage.goto('/admin/vendors');
    const row = reviewerPage.locator('li').filter({ hasText: businessName });
    await row.getByRole('button', { name: 'Approve' }).click();
    await reviewerPage.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();
    await expect(reviewerPage.getByRole('status')).toContainText(businessName);
    await reviewerPage.close();

    const { data: after } = await admin().from('vendors').select('status').eq('id', vendorId).single();
    expect(after!.status).toBe('active');
  });

  test('vendor edits their profile from the dashboard', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, vendorUser.email);
    await page.goto('/vendor/dashboard');

    await page.getByRole('button', { name: 'Profile' }).click();
    await page.getByRole('button', { name: 'Edit profile' }).click();

    await page.getByLabel('Description').fill('We photograph weddings across Maharashtra.');
    await page.getByLabel('Starting price (₹)').fill('40000');
    await page.getByLabel('Phone').fill('+91 90000 12345');
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page.getByRole('status')).toContainText('Profile saved');

    const { data } = await admin()
      .from('vendors')
      .select('description, starting_price, phone')
      .eq('id', vendorId)
      .single();
    expect(data!.description).toBe('We photograph weddings across Maharashtra.');
    expect(data!.starting_price).toBe(40000);
    expect(data!.phone).toBe('+91 90000 12345');
  });

  test('vendor adds a priced service', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, vendorUser.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Services' }).click();

    // The panel says plainly that nobody can book yet.
    await expect(page.getByText(/Customers cannot book you yet/i)).toBeVisible();

    await page.getByRole('button', { name: /Add (your first )?service/ }).first().click();
    await page.getByLabel('Service name').fill(SERVICE);
    await page.getByLabel('Description').fill('Ten hours, two photographers, edited gallery.');
    await page.getByLabel('Price (₹)').fill(String(PRICE));
    await page.getByRole('button', { name: 'Add service' }).click();

    await expect(page.getByText(SERVICE)).toBeVisible();
    await expect(page.getByText(/Customers cannot book you yet/i)).toHaveCount(0);

    const { data } = await admin()
      .from('vendor_services')
      .select('name, price, is_active')
      .eq('vendor_id', vendorId)
      .single();
    expect(data!.name).toBe(SERVICE);
    expect(data!.price).toBe(PRICE);
    expect(data!.is_active).toBe(true);
  });

  test('vendor uploads a portfolio image', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, vendorUser.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Portfolio' }).click();

    await page.getByLabel('Choose an image').setInputFiles({
      name: 'sample.png',
      mimeType: 'image/png',
      buffer: Buffer.from(PNG_BASE64, 'base64'),
    });
    await page.getByLabel('Describe this image').fill('A wedding ceremony');
    await page.getByRole('button', { name: 'Upload image' }).click();

    await expect(page.getByAltText('A wedding ceremony')).toBeVisible();

    // The row exists and the object is actually in the vendor's own folder.
    const { data: rows } = await admin()
      .from('vendor_media')
      .select('url, alt_text')
      .eq('vendor_id', vendorId);
    expect(rows!.length).toBe(1);
    expect(rows![0].alt_text).toBe('A wedding ceremony');
    expect(rows![0].url).toContain(`/${BUCKET}/${vendorId}/`);

    const { data: objects } = await admin().storage.from(BUCKET).list(vendorId);
    expect((objects ?? []).length).toBe(1);
  });

  test('the marketplace reflects the edited profile', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent(businessName)}`);
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
  });

  test('a customer sees the service, price and portfolio, and can start a booking', async ({
    page,
  }) => {
    await page.goto('/auth');
    await signIn(page, customer.email);
    await page.goto(`/vendors/${slug}`);

    await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
    await expect(page.getByText('We photograph weddings across Maharashtra.')).toBeVisible();
    await expect(page.getByText(SERVICE)).toBeVisible();
    await expect(page.getByText(`₹${PRICE.toLocaleString('en-IN')}`)).toBeVisible();
    await expect(page.getByAltText('A wedding ceremony')).toBeVisible();

    // Contact details are actionable rather than inert text.
    await expect(page.getByRole('link', { name: '+91 90000 12345' })).toHaveAttribute(
      'href',
      'tel:+919000012345',
    );

    // Requesting a booking is the primary action.
    await page.getByRole('button', { name: 'Request a booking' }).click();
    await page.getByLabel('Event date').fill('2027-03-14');
    await page.getByRole('button', { name: /Send booking request/i }).click();

    await expect(page.getByRole('heading', { name: /request submitted/i })).toBeVisible();

    // The price came from the server, not the browser.
    const { data } = await admin()
      .from('bookings')
      .select('quoted_price, status')
      .eq('vendor_id', vendorId)
      .single();
    expect(data!.quoted_price).toBe(PRICE);
    expect(data!.status).toBe('pending');
  });

  test('deactivating the service removes it from the customer view', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, vendorUser.email);
    await page.goto('/vendor/dashboard');
    await page.getByRole('button', { name: 'Services' }).click();
    await page.getByRole('button', { name: 'Deactivate' }).click();

    // "Inactive" is both the section heading and the badge on the row; assert
    // the section, which only exists when something is in it.
    await expect(page.getByRole('heading', { name: 'Inactive' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate' })).toBeVisible();

    // The historical booking is untouched.
    const { data } = await admin()
      .from('bookings')
      .select('quoted_price')
      .eq('vendor_id', vendorId)
      .single();
    expect(data!.quoted_price).toBe(PRICE);

    await page.goto(`/vendors/${slug}`);
    await expect(page.getByText(/has not listed any services yet/i)).toBeVisible();
  });
});
