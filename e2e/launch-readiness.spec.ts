import { test, expect, type Page } from '@playwright/test';

/**
 * Launch-readiness checks: response headers, the Content-Security-Policy in a
 * real browser, the legal pages, and the removed placeholders.
 *
 * `vite preview` serves the headers from vercel.json (see vite.config.ts), so
 * every other spec in this directory also runs under the production CSP. This
 * one adds what those cannot see: a blocked image or stylesheet does not fail
 * a functional assertion, so violations are collected and asserted on here.
 *
 * Requires `npx supabase start`. Playwright starts the preview server itself
 * and points it at the local stack.
 */

const REQUIRED_HEADERS = [
  'content-security-policy',
  'strict-transport-security',
  'x-content-type-options',
  'x-frame-options',
  'referrer-policy',
  'permissions-policy',
];

const LEGAL_PAGES = [
  { link: 'Terms', path: '/terms', heading: 'Terms and Conditions' },
  { link: 'Privacy', path: '/privacy', heading: 'Privacy Policy' },
  {
    link: 'Cancellation & refunds',
    path: '/cancellation-and-refunds',
    heading: 'Cancellation and Refund Policy',
  },
];

/**
 * Records every CSP violation the page reports. The listener is installed
 * before any page script runs, so a violation during startup is not missed.
 */
async function collectCspViolations(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const store: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = store;
    document.addEventListener('securitypolicyviolation', (event) => {
      store.push(`${event.effectiveDirective} blocked ${event.blockedURI || '(inline)'}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);
}

test.describe('security headers', () => {
  for (const path of ['/', '/vendors', '/terms']) {
    test(`are served on ${path}`, async ({ request }) => {
      const response = await request.get(path);
      expect(response.status()).toBe(200);
      const headers = response.headers();
      for (const name of REQUIRED_HEADERS) {
        expect(headers[name], name).toBeTruthy();
      }
      expect(headers['x-frame-options']).toBe('DENY');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(headers['content-security-policy']).toContain("object-src 'none'");
    });
  }

  test('lets Razorpay Checkout in, and only Razorpay', async ({ request }) => {
    // Established by loading checkout.js under this policy and recording every
    // violation (docs/OCASIO_DEPLOYMENT.md §5). The payment form is a frame
    // from api.razorpay.com; no other origin may be framed.
    const headers = (await request.get('/')).headers();
    const directives = Object.fromEntries(
      headers['content-security-policy'].split(';').map((d) => {
        const [name, ...values] = d.trim().split(/\s+/);
        return [name, values];
      }),
    );
    expect(directives['script-src']).toEqual(
      expect.arrayContaining(['https://checkout.razorpay.com', 'https://cdn.razorpay.com']),
    );
    expect(directives['frame-src']).toEqual(['https://api.razorpay.com']);
    expect(headers['permissions-policy']).toContain('payment=(self "https://api.razorpay.com")');
    expect(headers['permissions-policy']).toContain('camera=()');
  });

  test('the CSP does not block the marketplace, vendor pages or sign-in', async ({ page }) => {
    const violations = await collectCspViolations(page);

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Catalogue data comes from Supabase, and its photographs from the image
    // host, so this exercises connect-src and img-src.
    await page.goto('/vendors');
    const firstVendor = page.locator('a[href^="/vendors/"]').first();
    await expect(firstVendor).toBeVisible();
    const image = page.locator('main img').first();
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true);

    await firstVendor.click();
    await expect(page).toHaveURL(/\/vendors\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await page.goto('/auth');
    await expect(page.getByLabel('Email address')).toBeVisible();

    expect(await violations()).toEqual([]);
  });
});

test.describe('legal pages', () => {
  for (const { link, path, heading } of LEGAL_PAGES) {
    test(`${heading} is linked from the footer and renders`, async ({ page }) => {
      const violations = await collectCspViolations(page);
      await page.goto('/');

      await page.getByRole('contentinfo').getByRole('link', { name: link, exact: true }).click();

      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page).toHaveTitle(`${heading} — Ocasio`);
      // Until counsel signs off, every page says it is a draft.
      await expect(page.getByText('Draft pending legal review')).toBeVisible();
      expect(await violations()).toEqual([]);
    });
  }

  test('each section in the contents list is reachable', async ({ page }) => {
    await page.goto('/privacy');
    const contents = page.getByRole('navigation', { name: 'On this page' });
    await expect(contents).toBeVisible();
    const entries = contents.getByRole('link');
    const count = await entries.count();
    expect(count).toBeGreaterThan(3);
    for (let i = 0; i < count; i++) {
      const href = await entries.nth(i).getAttribute('href');
      await expect(page.locator(href!)).toHaveCount(1);
    }
  });
});

test.describe('placeholders removed', () => {
  test('the footer no longer links to the blog, and /blog is not a page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('contentinfo').getByRole('link', { name: 'Blog' })).toHaveCount(0);

    await page.goto('/blog');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  });

  test('the contact page shows no placeholder address', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByRole('heading', { level: 1, name: 'Contact Ocasio' })).toBeVisible();
    await expect(page.getByText('ocasio.example')).toHaveCount(0);
  });

  test('the favicon is the Ocasio mark, not the Vite default', async ({ page, request }) => {
    await page.goto('/');
    const href = await page.locator('link[rel="icon"]').getAttribute('href');
    expect(href).toBe('/favicon.svg');

    const response = await request.get(href!);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/svg+xml');
    expect(await response.text()).toContain('<title>Ocasio</title>');
  });
});
