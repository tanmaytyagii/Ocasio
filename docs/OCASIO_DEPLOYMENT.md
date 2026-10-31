# Ocasio — Deployment

**Audience:** Whoever deploys and operates Ocasio.
**Companion to:** [`OCASIO_OPERATIONS.md`](./OCASIO_OPERATIONS.md) (reconciliation sweep) and
[`.env.example`](../.env.example) (every variable).

Ocasio is a static React bundle on Vercel talking to a hosted Supabase project. Nothing in this
document is automated by the repository; each step is something a person does once per environment.

---

## 1. Environments

Environments are separated by **where values are set**, never by committed files.

| Environment | Frontend | Supabase | Configuration lives in |
|---|---|---|---|
| Local | `npm run dev` | local stack (`npx supabase start`) | `.env` copied from `.env.local.example` |
| CI | `vite preview` inside the runner | local stack inside the runner | `.github/workflows/ci.yml` — no secrets |
| Preview | Vercel preview deployment for any non-`main` branch pushed (none in the direct-to-`main` workflow) | **a separate staging project** (recommended) | Vercel env vars, scope *Preview* |
| Production | Vercel production deployment | production project | Vercel env vars, scope *Production* |

Point Preview at a staging project, not production: preview deployments are built from unreviewed
branches.

---

## 2. Supabase (per hosted project)

1. `npx supabase link --project-ref <ref>`
2. `npx supabase db push` — applies all migrations. **Never run `seed.sql` against production**; it
   creates 40 fake businesses.
3. `npx supabase functions deploy payments-create-order payments-refund payments-webhook payments-reconcile`.
   JWT verification is set per function in `supabase/config.toml`: on for create-order and refund
   (customers and vendors call them with their session), **off for payments-webhook** (Razorpay
   sends no Supabase JWT; its HMAC signature is checked inside the function). Confirm the webhook's
   setting in the dashboard after deploying — with verification on, every Razorpay delivery is
   rejected at the gateway.
4. Set the Razorpay secrets — §6.
5. Create the two Vault secrets for the reconciliation sweep — [`OCASIO_OPERATIONS.md`](./OCASIO_OPERATIONS.md).
6. In the dashboard, under Authentication → URL Configuration, set the **Site URL** to the production
   domain and add the Preview domain pattern to **Redirect URLs**.
7. Configure custom SMTP before launch. The built-in mailer is rate-limited and not meant for
   production traffic.
8. Create the first admin: set `profiles.role = 'admin'` for that user with the service role. There is
   no path to admin from the app.
9. Harden email sign-in, under Authentication in the dashboard:
   - **Confirm email: on.** Without it anyone can register with an address they do not own
     ([SECURITY_AUDIT](./SECURITY_AUDIT.md) F-18).
   - **Minimum password length: 8**, matching `MIN_PASSWORD_LENGTH` in `src/lib/authErrors.ts`,
     which the sign-up form enforces (F-11).
   - **Secure password change: on** — changing a password requires a recent sign-in.

   `supabase/config.toml` sets the last two for the local stack but keeps confirmation **off**, so
   local sign-ups and the test suites can sign in at once. Do not `supabase config push` it to a
   hosted project unchanged.

---

## 3. Vercel

1. Import the GitHub repository. Vercel detects Vite: build command `npm run build`, output `dist`.
2. Under Settings → Environment Variables, set for **Preview** and **Production** separately:

   | Variable | Required |
   |---|---|
   | `VITE_SUPABASE_URL` | yes — `https://<ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | yes |
   | `VITE_SUPPORT_EMAIL` | before launch |
   | `VITE_PAYMENT_PROVIDER` | `razorpay` once Razorpay is activated (§6); defaults to `test` |

   The build **fails** without the required two, so a misconfigured deployment is never promoted.
   Never add the service-role key, or any non-public value, to Vercel's `VITE_*` variables.
3. `vercel.json` supplies the SPA rewrite and the security headers (§5). No dashboard header
   configuration is needed.

---

## 4. GitHub

1. Protect `main` as described in [`CI_CD.md`](./CI_CD.md) §5: block deletion and force pushes,
   no bypass, no pull-request requirement — development happens directly on `main`.

2. Settings → Actions → General: leave the default `GITHUB_TOKEN` permissions at read-only, and do
   not allow Actions to create or approve pull requests. The workflow declares `contents: read` and
   needs nothing more.
3. Settings → Code security: enable the **dependency graph** — dependency review needs it —
   Dependabot alerts, and **private vulnerability reporting**, which `SECURITY.md` sends reporters
   to and which is currently off ([SECURITY_AUDIT](./SECURITY_AUDIT.md) F-19).
4. CI needs **no repository secrets**. It runs against a throwaway local Supabase stack using
   Supabase's published development keys, and fake Razorpay values pointed at a closed port.

What each job does, and how to run it locally: [`CI_CD.md`](./CI_CD.md).

---

## 5. Security headers

Set in [`vercel.json`](../vercel.json) for every path. `vite preview` serves the same headers (see
`vite.config.ts`), so the Playwright suite runs under them, and
[`e2e/launch-readiness.spec.ts`](../e2e/launch-readiness.spec.ts) fails on any CSP violation.

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | Limits where scripts, styles, images and requests can go |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | HTTPS only, for two years. `preload` is deliberately absent — add it only once the production domain is final, because removal from the preload list is slow |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing |
| `X-Frame-Options` | `DENY` | No framing (older browsers; CSP `frame-ancestors` covers modern ones) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Full URLs never leave the site |
| `Permissions-Policy` | camera, microphone, geolocation, usb, topics off; `payment=(self "https://api.razorpay.com")` | Ocasio uses none of them. `payment` is delegated to Razorpay's Checkout frame alone, for UPI and wallet flows that use the Payment Request API |

### The Content-Security-Policy, directive by directive

| Directive | Allows | Because |
|---|---|---|
| `default-src` | `'self'` | Deny by default |
| `script-src` | `'self' https://checkout.razorpay.com https://cdn.razorpay.com` | The Vite bundle; Razorpay's `checkout.js` and the risk-detection script it loads. No inline script, no `eval` |
| `style-src` | `'self' 'unsafe-inline'` | Ocasio's own CSS is one extracted file, but `checkout.js` injects a `<style>` element and `style` attributes into the page, and Checkout does not render without them |
| `img-src` | `'self' data: blob:` `https://images.unsplash.com` `https://*.supabase.co` | Bundled assets; Tailwind's inline SVG chevrons (`data:`); portfolio upload previews (`blob:`); catalogue photographs; Supabase Storage |
| `connect-src` | `'self' https://*.supabase.co https://lumberjack.razorpay.com` | Auth, PostgREST, Storage and the payment functions; Checkout's telemetry |
| `font-src`, `manifest-src`, `worker-src` | `'self'` | Nothing external |
| `frame-src` | `https://api.razorpay.com` | Razorpay Checkout's payment form, and nothing else |
| `frame-ancestors` | `'none'` | Nobody may embed Ocasio |
| `object-src` | `'none'` | No plugins |
| `base-uri`, `form-action` | `'self'` | No `<base>` hijacking; forms post only to Ocasio |

### Pinned per build to one Supabase project

`https://*.supabase.co` in the header matches **every** Supabase project, not just Ocasio's, and one
`vercel.json` serves Preview and Production alike. Vendors control image URLs (`hero_image_url`,
portfolio rows), so with the header alone an approved vendor could point one at a project of their
own and learn who viewed their page ([SECURITY_AUDIT](./SECURITY_AUDIT.md) F-12).

So every production build also carries a `<meta http-equiv="Content-Security-Policy">`, generated by
`vite.config.ts` from the header's `img-src` and `connect-src` with the wildcard replaced by that
build's own `VITE_SUPABASE_URL` origin. Browsers enforce both policies — a request must pass each —
so a Preview build reaches only the staging project and a Production build only production. There
are no hosts to maintain. The header keeps the wildcard as the outer bound; nothing else is
restricted by the meta policy, and nothing is relaxed.

Check a deployment: the first element of `<head>` in its HTML is that meta tag, naming the right
project.

### Changing it

The policy allows only what the app uses today. Each of these needs a change in `vercel.json`, and the
E2E suite should be run afterwards:

- **Razorpay changes what Checkout loads.** Razorpay does not publish a CSP allowlist, so the
  Razorpay entries above were measured: `checkout.js` was opened under this policy in Chromium and
  every `securitypolicyviolation` recorded, until there were none and the Checkout frame rendered.
  If Checkout stops opening in production, repeat that — the browser console names the blocked
  origin — and add only what it names. `e2e/launch-readiness.spec.ts` pins the current entries.
- **Supabase Realtime.** Add `wss://*.supabase.co` to `connect-src`.
- **A Supabase custom domain.** The header's `*.supabase.co` no longer matches; add the custom host
  to `connect-src` and `img-src` in `vercel.json` (the meta policy follows `VITE_SUPABASE_URL` by
  itself).
- **A new image host or font host.** Add it to `img-src` or `font-src`.
- **Analytics or error reporting.** Add the collector's ingest host to `connect-src`, and its script
  host to `script-src` if it loads one.

Check a deployment with `curl -sI https://<deployment-url>/`. The headers must be present on deep
links too, such as `/vendors`.

---

## 6. Razorpay

How the integration works is in [`OCASIO_PAYMENTS.md`](./OCASIO_PAYMENTS.md) §14. This section is
configuration only. Razorpay keeps **Test mode** and **Live mode** completely separate — keys,
webhooks and payments — so everything below is done once per mode.

| | Sandbox (Test mode) | Production (Live mode) |
|---|---|---|
| Supabase project | staging | production |
| `RAZORPAY_KEY_ID` | `rzp_test_…` | `rzp_live_…` |
| `RAZORPAY_KEY_SECRET` | Test mode secret | Live mode secret |
| Webhook URL | `https://<staging-ref>.supabase.co/functions/v1/payments-webhook` | `https://<prod-ref>.supabase.co/functions/v1/payments-webhook` |
| `RAZORPAY_WEBHOOK_SECRET` | the Test webhook's secret | the Live webhook's secret |
| `VITE_PAYMENT_PROVIDER` (Vercel) | `razorpay` in Preview | `razorpay` in Production, once live keys work |
| Money | none — test cards only | real |

Never put live keys in a staging project or on a development machine.

### 6.1 Razorpay Dashboard

1. **Payment capture: automatic.** Account & Settings → Payment Capture. Ocasio settles a payment
   on `payment.captured` only. With manual capture, authorised payments are never captured,
   bookings stay "awaiting confirmation", and Razorpay refunds them automatically after a few days.
2. **API keys.** Account & Settings → API Keys → generate a key for the mode. The secret is shown
   once; it goes straight into Supabase secrets (§6.2) and nowhere else.
3. **Webhook.** Account & Settings → Webhooks → Add New Webhook:
   - URL: the `payments-webhook` URL from the table above (port 443, HTTPS);
   - Secret: a long random value, e.g. `openssl rand -hex 32` — the same value goes into
     `RAZORPAY_WEBHOOK_SECRET`;
   - Active events: **`payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`**.
     Other events are acknowledged and ignored, so subscribing to more does no harm, but nothing
     uses them;
   - Alert email: a monitored inbox. Razorpay retries a failing webhook for 24 hours and then
     **disables it**; the alert is the only notice.
4. If the account is used by anything other than Ocasio, its webhook also receives events for
   orders Ocasio did not create. Those are recorded in `payment_events` and acknowledged with a
   200, so they cannot get the webhook disabled — but a dedicated account keeps the records clean.

### 6.2 Supabase secrets

```bash
npx supabase secrets set \
  RAZORPAY_KEY_ID=rzp_test_… \
  RAZORPAY_KEY_SECRET=… \
  RAZORPAY_WEBHOOK_SECRET=…
```

Do not set `RAZORPAY_API_BASE` on a hosted project — it exists only to point local development at
a stand-in. Leave `PAYMENT_PROVIDER` unset: only the reconciliation sweep reads it, and it has no
Razorpay adapter yet (see Remaining risks in `OCASIO_PAYMENTS.md` §14).

The functions fail closed: without the key pair, create-order and refund answer 503; without the
webhook secret, the webhook rejects every delivery.

### 6.3 Local development

```bash
cp supabase/functions/.env.example supabase/functions/.env   # Test mode keys only
npx supabase functions serve --env-file supabase/functions/.env
# .env: VITE_PAYMENT_PROVIDER=razorpay, then npm run dev
```

Razorpay cannot reach `localhost`, so to receive real Test mode webhooks locally, expose the
functions with a tunnel (for example `cloudflared tunnel --url http://127.0.0.1:54321`) and point a
Test mode webhook at `<tunnel-url>/functions/v1/payments-webhook`.

The automated suites need none of this. They run the same handlers against the real local
database with Razorpay replaced by an in-memory stand-in, and deliver webhooks signed exactly as
Razorpay signs them (`tests/razorpay-payments.test.ts`).

### 6.4 Sandbox payment testing

In Test mode, Checkout accepts Razorpay's test instruments
([razorpay.com/docs/payments/payments/test-card-details](https://razorpay.com/docs/payments/payments/test-card-details/)):

| To test | Use |
|---|---|
| A successful card payment | Visa `4100 2800 0000 1007` or Mastercard `5555 5100 0008 1006`; any future expiry; any CVV; an OTP of 4–10 digits |
| A failed payment | the same card with an OTP shorter than 4 digits, or Visa `4100 2800 0006 0003` (declined) |

A sandbox run, end to end:

1. Book a vendor as a customer; accept as the vendor.
2. Pay as the customer. The panel shows "Payment submitted. Waiting for Razorpay to confirm it…" and
   turns to **Paid** only when `payment.captured` has been processed — check
   `payment_events` if it does not.
3. Fail a payment, close Checkout, and pay again: the same order reopens (one
   `provider_order_id` per booking).
4. Refund part of it as the vendor: "Refund requested" until `refund.processed`, then
   "Partially refunded".
5. Razorpay Dashboard → Webhooks → the webhook's delivery log should show only 2xx responses.

### 6.5 Production activation checklist

- [ ] Razorpay account activated for Live mode (business KYC complete).
- [ ] Live mode: payment capture set to **automatic**.
- [ ] Live API keys generated; `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` set on the production
      project only.
- [ ] Live webhook created with the four events, its secret set as `RAZORPAY_WEBHOOK_SECRET`, and
      an alert email that someone reads.
- [ ] `payments-webhook` deployed with JWT verification **off**; create-order and refund with it
      **on**.
- [ ] A ₹1 live payment completed and refunded end to end, with only 2xx in the webhook log.
- [ ] `VITE_PAYMENT_PROVIDER=razorpay` in Vercel Production, then redeploy.
- [ ] Legal pages updated: name Razorpay, and remove "online payment is not live yet" (Terms §5,
      Privacy, Cancellation & Refund Policy).
- [ ] Someone is responsible for the audit rows that need a person: `payment.needs_review`,
      `payment.capture_conflict`, `payment.duplicate_capture`, `payment.verification_failed`,
      `refund.verification_failed`, `refund.state_conflict`.

---

## 7. Launch checklist

Items that need a person, not code:

- [ ] Fill in `src/lib/site.ts`: registered entity name, registered address, grievance officer,
      jurisdiction city.
- [ ] Lawyer reviews the Terms, Privacy and Cancellation & Refund pages, and every inline
      "Legal review" note is resolved; then set `SITE.legal.reviewed = true` and update
      `lastUpdated`.
- [ ] Create a monitored support inbox and set `VITE_SUPPORT_EMAIL` in Vercel.
- [ ] Confirm in the Supabase dashboard that the project whose URL and anon key are in early git
      history (commits `6dc2bc1`, `4fd1ba9`; ref starting `inkb`) is deleted — its hostname no
      longer resolves — or, if it still exists, rotate its JWT secret or delete it
      ([SECURITY_AUDIT](./SECURITY_AUDIT.md) F-10; earlier: product audit SEC-1). History is not
      rewritten; the key stops mattering once it opens nothing.
- [ ] Push the workflow, confirm all six CI jobs pass **on GitHub**, then turn on branch protection
      for `main` as in §4.
- [ ] Enable private vulnerability reporting on the repository (§4) — `SECURITY.md` depends on it.
- [ ] Supabase Auth: Site URL, redirect URLs, custom SMTP, email confirmation, 8-character
      passwords and secure password change, as in §2.
- [ ] On the first Preview and Production deployments, check the meta CSP names the right project (§5).
- [ ] Razorpay: the production activation checklist (§6.5), including the ₹1 live payment and
      refund, and a named owner for the audit rows that need a person.
- [ ] Decide what the footer's "sample data" notice should say once production holds real vendors
      instead of the seeded catalogue.

---

## 8. Rollback

| Layer | How | Notes |
|---|---|---|
| Frontend | Vercel → Deployments → the last good production deployment → **Instant Rollback** | Seconds; no rebuild. The `VITE_*` values baked into that build come with it |
| Edge functions | Check out the last good commit and `npx supabase functions deploy <name>` | Deploy only the functions that changed. Function code and migrations from one release belong together — check that the older code still matches the current schema |
| Database | **Roll forward**: write a new migration that undoes the change, and `db push` it | Migrations are append-only and never edited once shipped. Before a risky `db push`, take a backup (`npx supabase db dump`, or the project's scheduled backups where the plan includes them); restoring one discards everything written since |
| Razorpay | Nothing to roll back: settled payments stay settled | If the webhook was disabled after repeated failures, fix the cause and re-enable it in the Razorpay Dashboard. Do not count on events from while it was off arriving later: check that window's captures and refunds in the Dashboard |

Order of a release that changes everything: database first (additive migrations keep the old code
working), then edge functions, then the frontend. Roll back in the reverse order.
