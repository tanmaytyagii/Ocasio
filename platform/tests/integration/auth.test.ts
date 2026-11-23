import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';
import { createPool, decryptMail, environment } from '@ocasio/database';
import { parseEnvironment } from '@ocasio/contracts';
import { createApplication } from '../../apps/api/dist/app';

const initial = environment();
const admin = createPool(initial.DATABASE_URL);
const databaseName = `ocasio_auth_test_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(initial.DATABASE_URL);
databaseUrl.pathname = `/${databaseName}`;
const config = parseEnvironment({ ...initial, NODE_ENV: 'test', SESSION_SECRET: randomBytes(32).toString('hex'), DATABASE_URL: databaseUrl.toString(), GOOGLE_CLIENT_ID: undefined, GOOGLE_CLIENT_SECRET: undefined });
let createdDatabase = false;
let pool: Pool;
let app: Awaited<ReturnType<typeof createApplication>>;
let base: string;

before(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  pool = createPool(databaseUrl.toString());
  for (const name of (await readdir('packages/database/migrations')).filter((file) => file.endsWith('.sql')).sort()) {
    await pool.query(await readFile(`packages/database/migrations/${name}`, 'utf8'));
  }
  app = await createApplication(config, true);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
});

after(async () => {
  await app?.close();
  await pool?.end();
  if (createdDatabase) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin.end();
});

beforeEach(async () => {
  // Cases share a loopback client IP but represent independent users/journeys.
  // Reset only limiter state inside this suite's newly created disposable DB.
  await pool.query('TRUNCATE auth_rate_limits');
});

class BrowserSession {
  private readonly cookies = new Map<string, string>();
  csrfToken = '';

  constructor(private readonly targetBase?: string) {}

  async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    const cookie = Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join('; ');
    if (cookie) headers.set('Cookie', cookie);
    const response = await fetch(`${this.targetBase ?? base}${path}`, { ...init, headers, redirect: 'manual' });
    for (const setCookie of response.headers.getSetCookie()) {
      const pair = setCookie.split(';')[0]!;
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (!value || /Max-Age=0(?:;|$)/i.test(setCookie)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }

  async bootstrap() {
    const response = await this.request('/api/v1/security/session');
    assert.equal(response.status, 200);
    const body = await response.json() as { authenticated: boolean; csrfToken: string };
    assert.match(body.csrfToken, /^[a-f0-9]{64}$/);
    this.csrfToken = body.csrfToken;
    return body;
  }

  post(path: string, body: unknown, overrides: Record<string, string | undefined> = {}) {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', Origin: config.WEB_ORIGIN, 'X-CSRF-Token': this.csrfToken };
    for (const [name, value] of Object.entries(overrides)) {
      if (value === undefined) delete headers[name];
      else headers[name] = value;
    }
    return this.request(`/api/v1/auth${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  cookieHeader() { return Array.from(this.cookies, ([name, value]) => `${name}=${value}`).join('; '); }
}

const password = () => `Test-password-${randomBytes(12).toString('hex')}`;
const emailAddress = () => `integration-${randomUUID()}@ocasio.test`;

async function register(client: BrowserSession, email = emailAddress(), secret = password(), extra: Record<string, unknown> = {}) {
  await client.bootstrap();
  const response = await client.post('/sign-up/email', { name: 'Integration Customer', email, password: secret, callbackURL: '/account', ...extra });
  assert.equal(response.status, 200, `registration failed: ${await response.clone().text()}`);
  return { email, secret };
}

async function mailUrl(email: string, type: 'verify' | 'reset'): Promise<URL> {
  // The application queues encrypted delivery, so no real address or external inbox is used.
  const result = await pool.query('SELECT encrypted_payload FROM auth_mail_queue ORDER BY created_at DESC');
  for (const row of result.rows) {
    const payload = decryptMail(row.encrypted_payload, config.SESSION_SECRET);
    if (payload.to !== email) continue;
    const link = payload.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) continue;
    const url = new URL(link);
    if (type === 'verify' ? url.pathname.includes('verify-email') : url.pathname.includes('reset-password')) return url;
  }
  assert.fail(`No ${type} delivery found for isolated test account`);
}

async function verify(client: BrowserSession, email: string) {
  const url = await mailUrl(email, 'verify');
  const response = await client.request(`${url.pathname}${url.search}`);
  assert.ok([200, 302, 303].includes(response.status), `verification failed: ${response.status}`);
  return url;
}

async function verifiedAccount() {
  const client = new BrowserSession();
  const account = await register(client);
  await verify(client, account.email);
  return { client, ...account };
}

async function login(client: BrowserSession, email: string, secret: string) {
  await client.bootstrap();
  return client.post('/sign-in/email', { email, password: secret });
}

test('auth options advertise email/password and honestly disable unconfigured Google', async () => {
  const response = await fetch(`${base}/api/v1/auth-options`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { google: false, emailPassword: true, localEmailInbox: true });
  const client = new BrowserSession();
  await client.bootstrap();
  const social = await client.post('/sign-in/social', { provider: 'google', callbackURL: '/account' });
  assert.ok(social.status >= 400 && social.status < 500);
  assert.equal((await client.bootstrap()).authenticated, false);
});

test('signup stores hashed credentials, queues encrypted verification and refuses unverified login', async () => {
  const client = new BrowserSession();
  const { email, secret } = await register(client);
  assert.equal((await client.bootstrap()).authenticated, false);
  const stored = await pool.query('SELECT a.password FROM auth_accounts a JOIN auth_users u ON u.id=a."userId" WHERE u.email=$1', [email]);
  assert.equal(stored.rowCount, 1);
  assert.ok(typeof stored.rows[0].password === 'string');
  assert.notEqual(stored.rows[0].password, secret);
  assert.ok(stored.rows[0].password.length > 32);
  const queued = await pool.query('SELECT encrypted_payload FROM auth_mail_queue');
  const ownMail = queued.rows.filter(row => decryptMail(row.encrypted_payload, config.SESSION_SECRET).to === email);
  assert.ok(ownMail.length > 0);
  assert.ok(!JSON.stringify(ownMail).includes(secret));
  assert.ok(!JSON.stringify(ownMail).includes('verify-email'));
  assert.ok(!JSON.stringify(ownMail).includes(email));
  assert.ok((await login(client, email, secret)).status >= 400);
  assert.equal((await client.request('/api/v1/me')).status, 401);
  await verify(client, email);
  assert.equal((await login(client, email, secret)).status, 200);
  assert.equal((await client.bootstrap()).authenticated, true);
});

test('verified login provides a real session and logout revokes captured credentials', async () => {
  const { client, email, secret } = await verifiedAccount();
  const beforeLogin = client.cookieHeader();
  const response = await login(client, email, secret);
  assert.equal(response.status, 200);
  assert.notEqual(client.cookieHeader(), beforeLogin);
  const identity = await client.request('/api/v1/me');
  assert.equal(identity.status, 200);
  const body = await identity.json();
  assert.ok(JSON.stringify(body).includes(email));
  assert.ok(!JSON.stringify(body).includes(secret));
  assert.ok((await client.request('/api/v1/auth/get-session')).status === 200);
  const captured = client.cookieHeader();
  assert.equal((await client.post('/sign-out', {})).status, 200);
  assert.equal((await client.request('/api/v1/me')).status, 401);
  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { Cookie: captured } })).status, 401);
});

test('native auth mutations reject missing CSRF, missing origin and hostile origins without creating users', async () => {
  const client = new BrowserSession();
  await client.bootstrap();
  for (const overrides of [{ 'X-CSRF-Token': undefined }, { Origin: undefined }, { Origin: 'https://untrusted.example' }, { 'Sec-Fetch-Site': 'cross-site' }]) {
    const email = emailAddress();
    const response = await client.post('/sign-up/email', { name: 'Forged signup', email, password: password() }, overrides);
    assert.equal(response.status, 403);
    assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1', [email])).rowCount, 0);
  }
});

test('weak passwords, hostile callback URLs and invalid verification tokens cannot authenticate', async () => {
  const client = new BrowserSession();
  await client.bootstrap();
  const weakEmail = emailAddress();
  const weak = await client.post('/sign-up/email', { name: 'Weak Password', email: weakEmail, password: 'short' });
  assert.ok(weak.status >= 400 && weak.status < 500);
  assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1', [weakEmail])).rowCount, 0);
  const oversizedEmail = emailAddress();
  const oversized = await client.post('/sign-up/email', { name: 'Oversized Password', email: oversizedEmail, password: 'A'.repeat(129) });
  assert.ok(oversized.status >= 400 && oversized.status < 500);
  assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1', [oversizedEmail])).rowCount, 0);
  const hostileEmail = emailAddress();
  const hostile = await client.post('/sign-up/email', { name: 'Hostile callback', email: hostileEmail, password: password(), callbackURL: 'https://untrusted.example/steal' });
  assert.ok(hostile.status >= 400 && hostile.status < 500);
  const invalid = await client.request('/api/v1/auth/verify-email?token=invalid-token&callbackURL=%2Faccount');
  assert.ok(invalid.status >= 400 || ([302, 303].includes(invalid.status) && (invalid.headers.get('location') ?? '').includes('error')));
  assert.equal((await client.bootstrap()).authenticated, false);
});

test('client-supplied administrator fields cannot become an elevated identity', async () => {
  const client = new BrowserSession();
  await client.bootstrap();
  const email = emailAddress();
  const secret = password();
  const response = await client.post('/sign-up/email', { name: 'Customer', email, password: secret, role: 'admin', isAdmin: true });
  if (response.status === 200) {
    await verify(client, email);
    assert.equal((await login(client, email, secret)).status, 200);
    const me = await client.request('/api/v1/me');
    assert.equal(me.status, 200);
    const body = await me.json() as Record<string, unknown>;
    assert.ok(!JSON.stringify(body).includes('"admin"'));
    assert.ok(!JSON.stringify(body).includes('"isAdmin":true'));
    const stored = (await pool.query('SELECT to_jsonb(u) AS record FROM auth_users u WHERE email=$1', [email])).rows[0].record as Record<string, unknown>;
    assert.notEqual(stored.role, 'admin');
    assert.notEqual(stored.isAdmin, true);
  } else {
    assert.ok(response.status >= 400 && response.status < 500);
    assert.equal((await pool.query('SELECT id FROM auth_users WHERE email=$1', [email])).rowCount, 0);
  }
});

test('password reset uses queued token, revokes sessions, rejects replay and changes the working password', async () => {
  const { client, email, secret } = await verifiedAccount();
  assert.equal((await login(client, email, secret)).status, 200);
  const captured = client.cookieHeader();
  const foreignRedirect = await client.post('/request-password-reset', { email, redirectTo: 'https://untrusted.example/reset-password' });
  assert.ok(foreignRedirect.status >= 400 && foreignRedirect.status < 500);
  const reset = await client.post('/request-password-reset', { email, redirectTo: '/reset-password' });
  assert.equal(reset.status, 200);
  const link = await mailUrl(email, 'reset');
  // Better Auth can send either a direct frontend token URL or its token redirect route.
  let token = link.searchParams.get('token') ?? link.pathname.match(/\/reset-password\/([^/]+)$/)?.[1];
  assert.ok(token, 'reset link contains a reset token');
  token = decodeURIComponent(token);
  const resetClient = new BrowserSession();
  await resetClient.bootstrap();
  const newPassword = password();
  const invalid = await resetClient.post('/reset-password', { token: 'invalid-token', newPassword });
  assert.ok(invalid.status >= 400 && invalid.status < 500);
  const changed = await resetClient.post('/reset-password', { token, newPassword });
  assert.equal(changed.status, 200, `reset failed: ${await changed.clone().text()}`);
  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { Cookie: captured } })).status, 401);
  const replay = await resetClient.post('/reset-password', { token, newPassword: password() });
  assert.ok(replay.status >= 400 && replay.status < 500);
  assert.ok((await login(new BrowserSession(), email, secret)).status >= 400);
  assert.equal((await login(new BrowserSession(), email, newPassword)).status, 200);
});

test('security-session destruction also revokes the authenticated identity session', async () => {
  const { client, email, secret } = await verifiedAccount();
  assert.equal((await login(client, email, secret)).status, 200);
  await client.bootstrap();
  const captured = client.cookieHeader();
  const response = await client.request('/api/v1/security/session', { method: 'DELETE', headers: { Origin: config.WEB_ORIGIN, 'X-CSRF-Token': client.csrfToken } });
  assert.equal(response.status, 204);
  assert.equal((await fetch(`${base}/api/v1/me`, { headers: { Cookie: captured } })).status, 401);
  assert.equal((await client.bootstrap()).authenticated, false);
});

test('repeated credential attempts are rate limited using persisted database state', async () => {
  const client = new BrowserSession();
  await client.bootstrap();
  const email = emailAddress();
  let limited: Response | undefined;
  for (let attempt = 0; attempt < 20; attempt++) {
    const response = await client.post('/sign-in/email', { email, password: password() });
    assert.ok(response.status >= 400 && response.status < 500);
    if (response.status === 429) {
      limited = response;
      break;
    }
  }
  assert.ok(limited, 'repeated login attempts must trigger the real limiter');
  assert.ok((await pool.query('SELECT count(*)::int AS count FROM auth_rate_limits')).rows[0].count > 0);
  assert.equal((await client.request('/api/v1/me')).status, 401);
});

test('configured Google constructs an OAuth initiation URL but missing-state callback cannot authenticate', async () => {
  const googleConfig = parseEnvironment({
    ...config,
    // Deliberately nonfunctional fixtures: this test never contacts Google or exchanges a code.
    GOOGLE_CLIENT_ID: 'test-only-google-client.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-only-not-a-real-google-secret',
  });
  const googleApp = await createApplication(googleConfig, true);
  try {
    await googleApp.listen(0, '127.0.0.1');
    const googleBase = await googleApp.getUrl();
    const client = new BrowserSession(googleBase);
    const options = await client.request('/api/v1/auth-options');
    assert.equal((await options.json() as { google: boolean }).google, true);
    assert.equal((await client.bootstrap()).authenticated, false);
    const response = await client.post('/sign-in/social', { provider: 'google', callbackURL: '/account' });
    assert.equal(response.status, 200);
    const payload = await response.json() as { url: string; redirect: boolean };
    const redirect = new URL(payload.url);
    assert.equal(redirect.protocol, 'https:');
    assert.equal(redirect.hostname, 'accounts.google.com');
    assert.match(redirect.pathname, /\/o\/oauth2\/(?:v2\/)?auth/);
    assert.equal(redirect.searchParams.get('client_id'), googleConfig.GOOGLE_CLIENT_ID);
    assert.equal(redirect.searchParams.get('redirect_uri'), `${config.WEB_ORIGIN}/api/v1/auth/callback/google`);
    assert.equal(redirect.searchParams.get('response_type'), 'code');
    assert.ok(redirect.searchParams.get('state'), 'OAuth initiation carries state');
    const challenge = redirect.searchParams.get('code_challenge');
    if (challenge !== null) {
      assert.match(challenge, /^[A-Za-z0-9_-]{43,128}$/);
      assert.equal(redirect.searchParams.get('code_challenge_method'), 'S256');
    }
    assert.ok(!payload.url.includes(googleConfig.GOOGLE_CLIENT_SECRET!));
    const callback = await client.request('/api/v1/auth/callback/google');
    assert.ok(callback.status >= 400 || ([302, 303].includes(callback.status) && (callback.headers.get('location') ?? '').includes('error')));
    assert.equal((await client.request('/api/v1/me')).status, 401);
    assert.equal((await client.bootstrap()).authenticated, false);
  } finally {
    await googleApp.close();
  }
});
