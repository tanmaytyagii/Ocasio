import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * Phase A end-to-end: a vendor applies, an admin reviews, the listing goes live.
 *
 * This is the loop that did not exist before — the application form stored
 * nothing and no path could approve what it created. The assertions follow a
 * real applicant and a real reviewer through the browser, and check the
 * database between steps so a green UI cannot hide a missing row.
 */
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';
const PASSWORD = 'e2e-password-12345';

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
  // Wait for the redirect to land. Navigating before it completes cancels the
  // sign-in and the next page loads signed out.
  await page.waitForURL((url) => !url.pathname.startsWith('/auth'), { timeout: 20000 });
}

// The steps build on one another — apply, then review, then verify — so they
// run in order. Fixtures are scoped to the project name because both browser
// projects run the same file, and vendors_one_per_owner allows exactly one
// application per user.
test.describe.configure({ mode: 'serial' });

test.describe('vendor supply funnel', () => {
  let applicant: { id: string; email: string };
  let reviewer: { id: string; email: string };
  let outsider: { id: string; email: string };
  let businessName: string;

  test.beforeAll(async () => {
    // Scoped to the project so both browser projects can run the same file:
    // vendors_one_per_owner allows exactly one application per user.
    const scope = test.info().project.name;
    businessName = `E2E Events ${scope} ${Date.now()}`;

    [applicant, reviewer, outsider] = await Promise.all([
      createUser(`applicant-${scope}`),
      createUser(`reviewer-${scope}`, 'admin'),
      createUser(`outsider-${scope}`),
    ]);
  });

  test.afterAll(async () => {
    const svc = admin();
    await svc.from('vendors').delete().eq('owner_id', applicant.id);
    await Promise.all(
      [applicant, reviewer, outsider].map((u) => svc.auth.admin.deleteUser(u.id)),
    );
  });

  test('a signed-out applicant is returned to the form after signing in', async ({ page }) => {
    await page.goto('/become-vendor');

    // The page is fillable before signing in; submitting is what needs an account.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The form validates before it sends anyone away: an incomplete form shows
    // its errors rather than costing a round trip to sign-in and back.
    await page.getByLabel('Business name').fill(businessName);
    await page.getByLabel('Category').selectOption('Photography');
    await page.getByLabel('City').fill('Mumbai');
    await page.getByRole('button', { name: /Sign in to submit/ }).click();

    await expect(page).toHaveURL(/\/auth/);
    await signIn(page, applicant.email);

    // Returned to where they were, not dumped on the homepage.
    await expect(page).toHaveURL(/\/become-vendor/);
  });

  test('submitting creates a pending vendor that is not yet in the marketplace', async ({
    page,
  }) => {
    await page.goto('/auth');
    await signIn(page, applicant.email);
    await page.goto('/become-vendor');

    await page.getByLabel('Business name').fill(businessName);
    await page.getByLabel('Category').selectOption('Photography');
    await page.getByLabel('City').fill('Mumbai');
    await page.getByLabel('About your business').fill('End-to-end test application.');
    await page.getByRole('button', { name: 'Submit application' }).click();

    await expect(
      page.getByRole('heading', { name: /application has been submitted/i }),
    ).toBeVisible();
    // It must not claim the listing is live.
    await expect(page.getByText(/pending review/i)).toBeVisible();

    const { data } = await admin()
      .from('vendors')
      .select('status, owner_id')
      .eq('business_name', businessName)
      .single();
    expect(data!.status).toBe('pending');
    expect(data!.owner_id).toBe(applicant.id);

    // Not discoverable while pending.
    await page.goto(`/search?q=${encodeURIComponent(businessName)}`);
    await expect(page.getByText(/0 vendors found/)).toBeVisible();
  });

  test('returning to the form shows the pending state, not a blank form', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, applicant.email);
    await page.goto('/become-vendor');

    await expect(page.getByRole('heading', { name: /under review/i })).toBeVisible();
    await expect(page.getByLabel('Business name')).toHaveCount(0);
  });

  test('a non-admin cannot reach the moderation console', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, outsider.email);
    await page.goto('/admin/vendors');

    await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Vendor applications' })).toHaveCount(0);
  });

  test('a signed-out visitor is sent to sign in, not to the console', async ({ page }) => {
    await page.goto('/admin/vendors');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('an admin approves the application and the listing goes live', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, reviewer.email);
    await page.goto('/admin/vendors');

    await expect(page.getByRole('heading', { name: 'Vendor applications' })).toBeVisible();
    const row = page.locator('li').filter({ hasText: businessName });
    await expect(row).toBeVisible();
    await expect(row.getByText(applicant.email)).toBeVisible();

    await row.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel(/^Note/).fill('Looks legitimate.');
    await page.getByRole('dialog').getByRole('button', { name: 'Approve' }).click();

    await expect(page.getByRole('status')).toContainText(businessName);

    const { data } = await admin()
      .from('vendors')
      .select('status')
      .eq('business_name', businessName)
      .single();
    expect(data!.status).toBe('active');
  });

  test('the approved vendor is now discoverable by anyone', async ({ page }) => {
    await page.goto(`/search?q=${encodeURIComponent(businessName)}`);
    await expect(page.getByRole('heading', { name: businessName })).toBeVisible();
  });

  test('the applicant now sees an active profile instead of the form', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, applicant.email);
    await page.goto('/become-vendor');
    await expect(page.getByRole('heading', { name: /already active/i })).toBeVisible();
  });
});
