import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * The Phase 2 marketplace flow, end to end in a real browser:
 *
 *   homepage -> search -> filter -> vendor detail -> view services
 *   -> favourite attempt while signed out -> sign in -> favourite
 *   -> refresh -> favourite persists
 *
 * Booking and payment are deliberately not exercised; they are not built.
 *
 * Requires `npx supabase start`. Playwright starts the preview server itself
 * and points it at the local stack.
 */

const SUPABASE_URL = 'http://127.0.0.1:54321';
const SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const PASSWORD = 'e2e-password-12345';

function admin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** A fresh confirmed user per run, so saved-vendor state never carries over. */
async function createUser(): Promise<{ id: string; email: string }> {
  const email = `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@ocasio.test`;
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create e2e user: ${error.message}`);
  return { id: data.user!.id, email };
}

async function signIn(page: Page, email: string) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('marketplace discovery', () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createUser();
  });

  test.afterAll(async () => {
    await admin().auth.admin.deleteUser(user.id);
  });

  test('anonymous visitor can discover, filter, inspect, then sign in and save a vendor', async ({
    page,
  }) => {
    // --- Homepage, signed out -------------------------------------------
    await page.goto('/');
    // Assert the hero's role rather than its exact wording, so a copy change
    // does not fail the test while a missing hero still would.
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('search', { name: 'Find vendors' })).toBeVisible();

    // Top-rated vendors come from the database, so at least one card renders.
    await expect(page.getByRole('heading', { name: 'Top-rated vendors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Browse by service' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How Ocasio works' })).toBeVisible();

    // --- Search ----------------------------------------------------------
    await page.goto('/search?q=photography');
    await expect(page.getByRole('heading', { name: /Results for "photography"/i })).toBeVisible();

    const resultCount = page.getByText(/\d+ vendors? found/);
    await expect(resultCount).toBeVisible();
    const beforeFilter = await resultCount.textContent();

    // --- Filter ----------------------------------------------------------
    // Filters live in the URL, so applying one is a navigation.
    await page.goto('/search?q=photography&location=Mumbai');
    await expect(page.getByText(/\d+ vendors? found/)).toBeVisible();
    const afterFilter = await page.getByText(/\d+ vendors? found/).textContent();
    expect(afterFilter).not.toBe(beforeFilter);

    // --- Vendor detail ----------------------------------------------------
    await page.goto('/vendors/capture-moments');
    await expect(page.getByRole('heading', { name: 'Capture Moments' })).toBeVisible();

    // Services come from vendor_services.
    await expect(page.getByRole('heading', { name: 'Services' })).toBeVisible();
    await expect(page.getByText('Candid Photography')).toBeVisible();

    // Portfolio comes from vendor_media.
    await expect(page.getByRole('heading', { name: 'Portfolio' })).toBeVisible();

    // --- Favourite while signed out --------------------------------------
    // Must not fail silently: it routes to sign in.
    await page.getByRole('button', { name: /^Save Capture Moments$/ }).click();
    await expect(page).toHaveURL(/\/auth/);

    // --- Sign in ----------------------------------------------------------
    await signIn(page, user.email);

    // Returned to where they were, not dumped on the homepage.
    await expect(page).toHaveURL(/\/vendors\/capture-moments/);

    // --- Favourite --------------------------------------------------------
    const saveButton = page.getByRole('button', { name: /^Save Capture Moments$/ });
    await expect(saveButton).toBeVisible();
    await saveButton.click();

    const savedButton = page.getByRole('button', {
      name: /^Remove Capture Moments from saved vendors$/,
    });
    await expect(savedButton).toBeVisible();
    await expect(savedButton).toHaveAttribute('aria-pressed', 'true');

    // The button renders optimistically and is disabled until the insert
    // resolves. Reloading before then cancels the in-flight request, so wait
    // for it to be re-enabled rather than racing the write.
    await expect(savedButton).toBeEnabled();

    // --- Refresh: the favourite persists ----------------------------------
    await page.reload();
    await expect(
      page.getByRole('button', { name: /^Remove Capture Moments from saved vendors$/ }),
    ).toHaveAttribute('aria-pressed', 'true');

    // --- And appears on the favourites page -------------------------------
    await page.goto('/favorites');
    await expect(page.getByRole('heading', { name: 'Saved vendors' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Capture Moments' })).toBeVisible();
  });

  test('vendor pages are reachable without signing in', async ({ page }) => {
    await page.goto('/vendors/royal-caterers');
    await expect(page.getByRole('heading', { name: 'Royal Caterers' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('a private route redirects a signed-out visitor to sign in', async ({ page }) => {
    await page.goto('/favorites');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('an unknown vendor slug renders the 404 page', async ({ page }) => {
    await page.goto('/vendors/definitely-not-a-real-vendor');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('sorting by price is reflected in the results', async ({ page }) => {
    await page.goto('/vendors?sort=price_asc');
    await expect(page.getByLabel('Sort by')).toHaveValue('price_asc');
    await expect(page.getByText(/\d+ vendors? found/)).toBeVisible();
  });

  test('pagination moves between pages', async ({ page }) => {
    await page.goto('/vendors');
    await expect(page.getByText(/Showing 1–12 of 40 vendors/)).toBeVisible();

    await page.getByRole('button', { name: 'Next' }).click();
    await expect(page.getByText(/Showing 13–24 of 40 vendors/)).toBeVisible();
    await expect(page).toHaveURL(/page=2/);
  });
});
