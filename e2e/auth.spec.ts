import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

/**
 * The sign-in screen, end to end in a real browser.
 *
 * The other suites use /auth as a means to an end — they sign a user in and
 * get on with the booking or the moderation flow. This one is about the screen
 * itself: what it says when authentication fails, where it sends people
 * afterwards, and what it refuses to be talked into.
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

function uniqueEmail(prefix: string): string {
  return `e2e-${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}@ocasio.test`;
}

async function createUser(): Promise<{ id: string; email: string }> {
  const email = uniqueEmail('auth');
  const { data, error } = await admin().auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw new Error(`could not create e2e user: ${error.message}`);
  return { id: data.user!.id, email };
}

/** For the account the sign-up test creates through the UI, which has no id yet. */
async function deleteUserByEmail(email: string) {
  const { data } = await admin().auth.admin.listUsers({ page: 1, perPage: 1000 });
  const match = data?.users.find((u) => u.email === email);
  if (match) await admin().auth.admin.deleteUser(match.id);
}

/** The account menu is the signed-in tell; "Sign out" lives inside it. */
async function expectSignedIn(page: Page) {
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test.describe('sign in', () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createUser();
  });

  test.afterAll(async () => {
    await admin().auth.admin.deleteUser(user.id);
  });

  test('renders one labelled form with no invented capabilities', async ({ page }) => {
    await page.goto('/auth');

    // Exactly one h1, and it is the page's own heading rather than the
    // wordmark, which used to be wrapped in one.
    const headings = page.getByRole('heading', { level: 1 });
    await expect(headings).toHaveCount(1);
    await expect(headings).toHaveText('Welcome to Ocasio');

    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();

    // The product has no OAuth provider configured and no password reset, so
    // the page must not offer either.
    await expect(page.getByRole('button', { name: /google|apple|facebook|continue with/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /google|apple|facebook|continue with/i })).toHaveCount(0);
    await expect(page.getByText(/forgot (your )?password/i)).toHaveCount(0);

    // And it must not pretend a signed-out visitor cannot browse.
    await expect(page.getByRole('link', { name: 'Browse vendors' })).toBeVisible();
  });

  test('offers sign in and create account as keyboard-operable tabs', async ({ page }) => {
    await page.goto('/auth');

    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(2);

    const signInTab = page.getByRole('tab', { name: 'Sign in' });
    const signUpTab = page.getByRole('tab', { name: 'Create account' });
    await expect(signInTab).toHaveAttribute('aria-selected', 'true');
    await expect(signUpTab).toHaveAttribute('aria-selected', 'false');

    await signInTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(signUpTab).toHaveAttribute('aria-selected', 'true');
    await expect(signUpTab).toBeFocused();

    await page.keyboard.press('ArrowLeft');
    await expect(signInTab).toHaveAttribute('aria-selected', 'true');
  });

  test('rejects wrong credentials without saying which half was wrong', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, user.email, 'not-the-password');

    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Email or password is incorrect.');

    // GoTrue's own wording never reaches the screen.
    await expect(page.locator('body')).not.toContainText('Invalid login credentials');
    // Nor does anything that would confirm the address exists.
    await expect(page.locator('body')).not.toContainText(/no account|not registered/i);

    // Still on the form, with the email preserved so it can be retried.
    await expect(page).toHaveURL(/\/auth/);
    await expect(page.getByLabel('Email address')).toHaveValue(user.email);
  });

  test('an unknown address fails exactly the same way', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, uniqueEmail('nobody'), PASSWORD);

    // Identical text to the wrong-password case: the form is not a membership
    // oracle.
    await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect.');
  });

  test('shows a disabled, labelled loading state and cannot be submitted twice', async ({
    page,
  }) => {
    await page.goto('/auth');

    // Held open deliberately: locally the round trip is too fast to observe.
    await page.route('**/auth/v1/token**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });

    await page.getByLabel('Email address').fill(user.email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();

    const submitting = page.getByRole('button', { name: /Signing in/ });
    await expect(submitting).toBeVisible();
    await expect(submitting).toBeDisabled();
    await expect(page.getByLabel('Email address')).toBeDisabled();

    await page.unroute('**/auth/v1/token**');
    await page.waitForURL((url) => !url.pathname.startsWith('/auth'));
  });

  test('signs in and lands on the homepage when nothing sent them here', async ({ page }) => {
    await page.goto('/auth');
    await signIn(page, user.email);

    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expectSignedIn(page);
  });

  test('toggles password visibility', async ({ page }) => {
    await page.goto('/auth');

    const password = page.getByLabel('Password');
    await password.fill(PASSWORD);
    await expect(password).toHaveAttribute('type', 'password');

    await page.getByRole('button', { name: 'Show password' }).click();
    await expect(password).toHaveAttribute('type', 'text');

    await page.getByRole('button', { name: 'Hide password' }).click();
    await expect(password).toHaveAttribute('type', 'password');
  });
});

test.describe('return path', () => {
  let user: { id: string; email: string };

  test.beforeAll(async () => {
    user = await createUser();
  });

  test.afterAll(async () => {
    await admin().auth.admin.deleteUser(user.id);
  });

  test('returns the user to the private route they were trying to reach', async ({ page }) => {
    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/auth/);

    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/bookings$/);
  });

  test('keeps the query string of the page they came from', async ({ page }) => {
    // Favouriting while signed out routes through /auth carrying the location,
    // query string included — which the old implementation discarded.
    await page.goto('/vendors?category=Catering&sort=price_asc');
    await page.getByRole('button', { name: /^Save / }).first().click();
    await expect(page).toHaveURL(/\/auth/);

    // FavoritesContext also sends an intent, which the page used to discard.
    await expect(page.getByText('Sign in to save this vendor.')).toBeVisible();

    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/vendors\?category=Catering&sort=price_asc$/);
  });

  test('honours ?next= so a reload does not lose the destination', async ({ page }) => {
    await page.goto('/auth?next=%2Ffavorites');
    await signIn(page, user.email);
    await expect(page).toHaveURL(/\/favorites$/);
  });

  test('refuses to redirect off-site', async ({ page }) => {
    for (const next of ['https://evil.test/steal', '//evil.test', '/\\evil.test']) {
      await page.goto(`/auth?next=${encodeURIComponent(next)}`);
      await signIn(page, user.email);

      // The homepage, never the attacker's host.
      await expect(page).toHaveURL('http://127.0.0.1:4173/');
      await signOut(page);
    }
  });

  test('refuses to bounce back to /auth', async ({ page }) => {
    await page.goto('/auth?next=%2Fauth');
    await signIn(page, user.email);
    await expect(page).toHaveURL('http://127.0.0.1:4173/');
  });
});

test.describe('create account', () => {
  const email = uniqueEmail('signup');

  test.afterAll(async () => {
    await deleteUserByEmail(email);
  });

  test('explains that every account starts as a customer account', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Create account' }).click();

    await expect(page.getByText(/Every account starts as a customer account/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Become a vendor' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();

    // The password field asks a manager for a new password, not the saved one.
    await expect(page.getByLabel('Password')).toHaveAttribute('autocomplete', 'new-password');
  });

  test('creates a working account and signs the new user in', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Create account' }).click();

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    // This project has email confirmation disabled, so Supabase returns a
    // session and the account is genuinely usable. The page must not claim a
    // confirmation email was sent.
    await expect(page).toHaveURL('http://127.0.0.1:4173/');
    await expectSignedIn(page);
    await expect(page.locator('body')).not.toContainText(/check your inbox/i);

    // A private route now opens rather than redirecting.
    await page.goto('/bookings');
    await expect(page).toHaveURL(/\/bookings$/);
  });

  test('will not confirm that an address is already taken', async ({ page }) => {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Create account' }).click();

    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();

    const alert = page.getByRole('alert');
    await expect(alert).toBeVisible();
    await expect(alert).not.toContainText(/already registered|already exists|already taken/i);
    await expect(alert).toContainText(/sign in/i);
  });
});

test.describe('composition', () => {
  // One project is enough: these assert layout at explicit widths, and the
  // mobile project would re-run the same widths for no extra signal.
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'chromium', 'layout sweep runs once');
  });

  const WIDTHS = [320, 375, 430, 768, 1024, 1280, 1440, 1920, 2560];

  for (const width of WIDTHS) {
    test(`is usable and does not overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/auth');

      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByLabel('Email address')).toBeVisible();
      await expect(page.getByLabel('Password')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible();

      // Nothing may push the document wider than the window.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);

      // Every control clears 44px. Links set inline in a sentence are left
      // out: WCAG 2.5.8 exempts them, and padding them to 44px would break
      // the paragraphs they sit in.
      const controls = await page
        .locator('button:visible, input:visible, a[href="/"]:visible')
        .evaluateAll((nodes) =>
          nodes.map((n) => ({
            tag: n.tagName,
            label: (n.getAttribute('aria-label') ?? n.textContent ?? '').trim().slice(0, 30),
            h: n.getBoundingClientRect().height,
          })),
        );
      expect(controls.length).toBeGreaterThan(0);
      for (const control of controls) {
        expect(
          control.h,
          `${control.tag} "${control.label}" at ${width}px`,
        ).toBeGreaterThanOrEqual(44);
      }
    });
  }

  test('does not request the panel photograph on a phone', async ({ page }) => {
    const images: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'image') images.push(request.url());
    });

    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/auth');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    expect(images.filter((url) => url.includes('images.unsplash.com'))).toHaveLength(0);
  });

  test('does request it on a desktop, where it is the composition', async ({ page }) => {
    const images: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'image') images.push(request.url());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/auth');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await expect
      .poll(() => images.filter((url) => url.includes('images.unsplash.com')).length)
      .toBeGreaterThan(0);
  });
});
