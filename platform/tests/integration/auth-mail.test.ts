import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool } from 'pg';
import { createPool, encryptMail, environment } from '@ocasio/database';
import { parseEnvironment } from '@ocasio/contracts';
import { processAuthMail } from '../../apps/worker/src/auth-mail';

const initial = environment();
const admin = createPool(initial.DATABASE_URL);
const databaseName = `ocasio_mail_test_${process.pid}_${Date.now()}`;
const databaseUrl = new URL(initial.DATABASE_URL);
databaseUrl.pathname = `/${databaseName}`;
const config = parseEnvironment({
  ...initial,
  NODE_ENV: 'test',
  DATABASE_URL: databaseUrl.toString(),
  SESSION_SECRET: randomBytes(32).toString('hex'),
  SMTP_HOST: '127.0.0.1',
  SMTP_PORT: 1025,
  SMTP_SECURE: false,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  MAIL_FROM: 'Ocasio integration <integration@synthetic.test>',
});
let createdDatabase = false;
let pool: Pool;

interface InboxMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

before(async () => {
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  createdDatabase = true;
  pool = createPool(databaseUrl.toString());
  for (const name of (await readdir('packages/database/migrations')).filter(file => file.endsWith('.sql')).sort()) {
    await pool.query(await readFile(`packages/database/migrations/${name}`, 'utf8'));
  }
  const response = await fetch('http://127.0.0.1:8035/api/v1/messages', { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200, 'Local synthetic-mail inbox must be available');
});

after(async () => {
  await pool?.end();
  if (createdDatabase) await admin.query(`DROP DATABASE "${databaseName}"`);
  await admin.end();
});

beforeEach(async () => {
  // Only this run's disposable database is reset; the shared inbox is untouched.
  await pool.query('TRUNCATE auth_mail_queue');
});

async function enqueue() {
  const id = randomUUID();
  const payload = {
    to: `delivery-${randomUUID()}@synthetic.test`,
    subject: `Ocasio synthetic delivery ${randomUUID()}`,
    text: 'Synthetic authentication-delivery integration fixture. No usable token.',
  };
  const ciphertext = encryptMail(payload, config.SESSION_SECRET);
  await pool.query('INSERT INTO auth_mail_queue(id, encrypted_payload) VALUES ($1,$2)', [id, ciphertext]);
  return { id, payload, ciphertext };
}

async function delivered(subject: string): Promise<InboxMessage[]> {
  const url = new URL('http://127.0.0.1:8035/api/v1/search');
  url.searchParams.set('query', `subject:"${subject}"`);
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  assert.equal(response.status, 200, 'Synthetic inbox search failed');
  const data = await response.json() as { messages: InboxMessage[] };
  return data.messages.filter(message => message.Subject === subject);
}

async function waitForDelivery(subject: string): Promise<InboxMessage[]> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const messages = await delivered(subject);
    if (messages.length > 0) return messages;
    await delay(50);
  }
  assert.fail('Synthetic message did not reach the local test inbox');
}

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  return port;
}

test('encrypted authentication mail reaches the synthetic inbox and successful handoff erases ciphertext', async () => {
  const { id, payload, ciphertext } = await enqueue();
  assert.ok(!ciphertext.includes(payload.to));
  assert.ok(!ciphertext.includes(payload.text));
  assert.equal(await processAuthMail(pool, config), 'sent');
  const row = (await pool.query('SELECT state,attempts,encrypted_payload,sent_at,locked_until,lock_token,last_error_code FROM auth_mail_queue WHERE id=$1', [id])).rows[0];
  assert.equal(row.state, 'sent');
  assert.equal(row.attempts, 1);
  assert.equal(row.encrypted_payload, null);
  assert.ok(row.sent_at instanceof Date);
  assert.equal(row.locked_until, null);
  assert.equal(row.lock_token, null);
  assert.equal(row.last_error_code, null);
  const messages = await waitForDelivery(payload.subject);
  assert.equal(messages.length, 1);
  assert.ok(messages[0]!.To.some(recipient => recipient.Address === payload.to));
  const detail = await fetch(`http://127.0.0.1:8035/api/v1/message/${encodeURIComponent(messages[0]!.ID)}`, { signal: AbortSignal.timeout(3000) });
  assert.equal(detail.status, 200);
  const body = await detail.json() as { Text: string };
  assert.ok(body.Text.includes(payload.text));
  assert.equal(await processAuthMail(pool, config), 'idle');
});

test('corrupt ciphertext becomes dead immediately with a fixed error code and no SMTP handoff', async () => {
  const id = randomUUID();
  await pool.query('INSERT INTO auth_mail_queue(id, encrypted_payload) VALUES ($1,$2)', [id, 'invalid-ciphertext']);
  assert.equal(await processAuthMail(pool, config), 'dead');
  const row = (await pool.query('SELECT state,attempts,last_error_code,locked_until,lock_token,sent_at FROM auth_mail_queue WHERE id=$1', [id])).rows[0];
  assert.deepEqual(row, { state: 'dead', attempts: 1, last_error_code: 'AUTH_MAIL_PAYLOAD_INVALID', locked_until: null, lock_token: null, sent_at: null });
  assert.equal(await processAuthMail(pool, config), 'idle');
});

test('SMTP refusal reschedules without plaintext errors and dead-letters the fifth failure', async () => {
  const { id, payload, ciphertext } = await enqueue();
  const unavailable = { ...config, SMTP_PORT: await unusedPort() };
  for (let attempt = 1; attempt <= 5; attempt++) {
    await pool.query('UPDATE auth_mail_queue SET available_at=now() WHERE id=$1', [id]);
    assert.equal(await processAuthMail(pool, unavailable), attempt === 5 ? 'dead' : 'retry');
    const row = (await pool.query('SELECT state,attempts,encrypted_payload,last_error_code,locked_until,lock_token,sent_at,available_at > now() AS deferred FROM auth_mail_queue WHERE id=$1', [id])).rows[0];
    assert.equal(row.state, attempt === 5 ? 'dead' : 'pending');
    assert.equal(row.attempts, attempt);
    assert.equal(row.encrypted_payload, ciphertext);
    assert.equal(row.last_error_code, 'AUTH_MAIL_DELIVERY_FAILED');
    assert.equal(row.locked_until, null);
    assert.equal(row.lock_token, null);
    assert.equal(row.sent_at, null);
    assert.equal(row.deferred, true);
    assert.equal(await processAuthMail(pool, unavailable), 'idle');
  }
  assert.equal((await delivered(payload.subject)).length, 0);
});

test('an expired fifth-attempt lease becomes terminal without a sixth send', async () => {
  const { id, payload } = await enqueue();
  await pool.query(`UPDATE auth_mail_queue SET state='processing', attempts=5,
    locked_until=now()-interval '1 second', lock_token=$2 WHERE id=$1`, [id, randomUUID()]);
  assert.equal(await processAuthMail(pool, config), 'dead');
  const row = (await pool.query('SELECT state,attempts,last_error_code,locked_until,lock_token FROM auth_mail_queue WHERE id=$1', [id])).rows[0];
  assert.deepEqual(row, { state: 'dead', attempts: 5, last_error_code: 'AUTH_MAIL_ATTEMPTS_EXHAUSTED', locked_until: null, lock_token: null });
  assert.equal((await delivered(payload.subject)).length, 0);
});

test('an expired earlier lease is reclaimed and delivered while an active lease is not claimed', async () => {
  const { id, payload } = await enqueue();
  await pool.query(`UPDATE auth_mail_queue SET state='processing', attempts=2,
    locked_until=now()+interval '2 minutes', lock_token=$2 WHERE id=$1`, [id, randomUUID()]);
  assert.equal(await processAuthMail(pool, config), 'idle');
  await pool.query(`UPDATE auth_mail_queue SET locked_until=now()-interval '1 second' WHERE id=$1`, [id]);
  assert.equal(await processAuthMail(pool, config), 'sent');
  const row = (await pool.query('SELECT state,attempts,encrypted_payload FROM auth_mail_queue WHERE id=$1', [id])).rows[0];
  assert.deepEqual(row, { state: 'sent', attempts: 3, encrypted_payload: null });
  assert.equal((await waitForDelivery(payload.subject)).length, 1);
});

test('concurrent workers claim a single pending message once and make one normal SMTP handoff', async () => {
  const { id, payload } = await enqueue();
  const results = await Promise.all(Array.from({ length: 6 }, () => processAuthMail(pool, config)));
  assert.equal(results.filter(state => state === 'sent').length, 1);
  assert.equal(results.filter(state => state === 'idle').length, 5);
  const row = (await pool.query('SELECT state,attempts,encrypted_payload,lock_token FROM auth_mail_queue WHERE id=$1', [id])).rows[0];
  assert.deepEqual(row, { state: 'sent', attempts: 1, encrypted_payload: null, lock_token: null });
  assert.equal((await waitForDelivery(payload.subject)).length, 1);
  assert.equal(await processAuthMail(pool, config), 'idle');
});
