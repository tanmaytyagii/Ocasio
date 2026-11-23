import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import type { Pool } from 'pg';
import { createPool, environment } from '@ocasio/database';
import { ApiErrorSchema, parseEnvironment } from '@ocasio/contracts';
import { createApplication } from '../../apps/api/dist/app';
import { sessionCookieName, sessionCookieOptions } from '../../apps/api/dist/security';

// Own a separate disposable database; no fixture clears an existing database.
const initial = environment();
const admin = createPool(initial.DATABASE_URL);
const databaseName = `ocasio_security_test_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(initial.DATABASE_URL);
databaseUrl.pathname = `/${databaseName}`;
const config = parseEnvironment({
  ...initial,
  NODE_ENV: 'test',
  SESSION_SECRET: randomBytes(32).toString('hex'),
  DATABASE_URL: databaseUrl.toString(),
});
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

type Session = { cookie: string; csrfToken: string; sid: string };

async function openSession(): Promise<Session> {
  const response = await fetch(`${base}/api/v1/security/session`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json() as { authenticated: boolean; csrfToken: string };
  assert.equal(body.authenticated, false);
  assert.match(body.csrfToken, /^[a-f0-9]{64}$/);
  const setCookie = response.headers.get('set-cookie');
  assert.ok(setCookie, 'session bootstrap sets a cookie');
  assert.match(setCookie, /^ocasio\.sid=/);
  assert.match(setCookie, /;\s*HttpOnly(?:;|$)/i);
  assert.match(setCookie, /;\s*SameSite=Lax(?:;|$)/i);
  assert.match(setCookie, /;\s*Path=\/(?:;|$)/i);
  assert.doesNotMatch(setCookie, /;\s*Domain=/i);
  const cookie = setCookie.split(';')[0]!;
  const signed = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
  assert.ok(signed.startsWith('s:'), 'session identifier is signed');
  const sid = signed.slice(2, signed.lastIndexOf('.'));
  assert.ok(sid.length > 0);
  return { cookie, csrfToken: body.csrfToken, sid };
}

async function destroy(session: Session, overrides: Record<string, string | undefined> = {}) {
  const headers: Record<string, string> = {
    Cookie: session.cookie,
    Origin: config.WEB_ORIGIN,
    'X-CSRF-Token': session.csrfToken,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete headers[key];
    else headers[key] = value;
  }
  return fetch(`${base}/api/v1/security/session`, { method: 'DELETE', headers });
}

async function assertForbidden(response: Response) {
  assert.equal(response.status, 403);
  const body = ApiErrorSchema.parse(await response.json());
  assert.equal(body.error.requestId, response.headers.get('x-request-id'));
  assert.ok(!JSON.stringify(body).includes(config.SESSION_SECRET));
}

test('public reads do not allocate a session; bootstrap persists a signed session with stable token', async () => {
  const count = (await pool.query('SELECT count(*)::int AS count FROM app_sessions')).rows[0].count;
  for (const path of ['/health/live', '/coverage']) {
    const response = await fetch(`${base}/api/v1${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM app_sessions')).rows[0].count, count);
  const session = await openSession();
  const persisted = await pool.query('SELECT sid, expire > now() AS unexpired FROM app_sessions WHERE sid=$1', [session.sid]);
  assert.equal(persisted.rowCount, 1);
  assert.equal(persisted.rows[0].unexpired, true);
  const repeated = await fetch(`${base}/api/v1/security/session`, { headers: { Cookie: session.cookie } });
  assert.equal(repeated.status, 200);
  const body = await repeated.json() as { authenticated: boolean; csrfToken: string };
  assert.deepEqual(body, { authenticated: false, csrfToken: session.csrfToken });
});

test('session survives an application restart with the same secret and database', async () => {
  const session = await openSession();
  await app.close();
  app = await createApplication(config, true);
  await app.listen(0, '127.0.0.1');
  base = await app.getUrl();
  const response = await fetch(`${base}/api/v1/security/session`, { headers: { Cookie: session.cookie } });
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { csrfToken: string }).csrfToken, session.csrfToken);
});

test('missing token, origin, cross-origin, wrong token and cross-site requests cannot destroy a session', async () => {
  const session = await openSession();
  for (const overrides of [
    { 'X-CSRF-Token': undefined },
    { Origin: undefined },
    { Origin: 'https://untrusted.example' },
    { Origin: `${config.WEB_ORIGIN}.untrusted.example` },
    { Origin: 'null' },
    { 'X-CSRF-Token': randomBytes(32).toString('hex') },
    { 'X-CSRF-Token': 'malformed' },
    { 'Sec-Fetch-Site': 'cross-site' },
    { Origin: undefined, Referer: `${config.WEB_ORIGIN}/` },
  ]) {
    await assertForbidden(await destroy(session, overrides));
    assert.equal((await pool.query('SELECT sid FROM app_sessions WHERE sid=$1', [session.sid])).rowCount, 1);
  }
});

test('a valid token from another session cannot authorize a mutation', async () => {
  const first = await openSession();
  const second = await openSession();
  assert.notEqual(first.csrfToken, second.csrfToken);
  assert.notEqual(first.sid, second.sid);
  await assertForbidden(await destroy(first, { 'X-CSRF-Token': second.csrfToken }));
  assert.equal((await pool.query('SELECT sid FROM app_sessions WHERE sid=ANY($1::text[])', [[first.sid, second.sid]])).rowCount, 2);
});

test('trusted origin and own token destroy the session, clear its cookie and reject replay', async () => {
  const session = await openSession();
  const response = await destroy(session, { 'Sec-Fetch-Site': 'same-origin' });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.match(response.headers.get('set-cookie') ?? '', /ocasio\.sid=;/);
  assert.match(response.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/i);
  assert.equal((await pool.query('SELECT sid FROM app_sessions WHERE sid=$1', [session.sid])).rowCount, 0);
  await assertForbidden(await destroy(session));
});

test('an expired persisted session cannot authorize a mutation', async () => {
  const session = await openSession();
  await pool.query(`UPDATE app_sessions SET expire=now()-interval '1 minute' WHERE sid=$1`, [session.sid]);
  await assertForbidden(await destroy(session));
});

test('malformed and tampered cookies do not cause unsafe errors or authorize a mutation', async () => {
  const session = await openSession();
  for (const cookie of ['ocasio.sid=%ZZ', 'ocasio.sid=s%3Ainvalid.signature', 'ocasio.sid=', `${session.cookie}tampered`]) {
    await assertForbidden(await destroy(session, { Cookie: cookie }));
    const response = await fetch(`${base}/api/v1/security/session`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200);
    const result = await response.json() as { authenticated: boolean; csrfToken: string };
    assert.equal(result.authenticated, false);
    assert.match(result.csrfToken, /^[a-f0-9]{64}$/);
    assert.notEqual(result.csrfToken, session.csrfToken);
  }
});

test('production cookie policy requires Secure and host-only scope', () => {
  const production = parseEnvironment({...config,NODE_ENV:'production',WEB_ORIGIN:'https://ocasio.example'});
  assert.equal(sessionCookieName(production),'__Host-ocasio.sid');
  assert.deepEqual(sessionCookieOptions(production),{httpOnly:true,secure:true,sameSite:'lax',path:'/'});
});

test('session storage outage fails closed without issuing a replacement session', async () => {
  const session = await openSession();
  await pool.query('ALTER TABLE app_sessions RENAME TO unavailable_sessions');
  try {
    const response = await fetch(`${base}/api/v1/security/session`,{headers:{Cookie:session.cookie}});
    assert.equal(response.status,503);
    assert.equal(response.headers.get('set-cookie'),null);
    assert.equal(ApiErrorSchema.parse(await response.json()).error.code,'SERVICE_UNAVAILABLE');
    assert.equal((await fetch(`${base}/api/v1/health/ready`)).status,503);
  } finally { await pool.query('ALTER TABLE unavailable_sessions RENAME TO app_sessions'); }
});
