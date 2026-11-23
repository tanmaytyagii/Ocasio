import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { Pool } from 'pg';
import { createPool, enqueueProbe, environment, processNextEvent, transaction } from '@ocasio/database';
import { ApiErrorSchema, CoverageResponseSchema, parseEnvironment } from '@ocasio/contracts';
import { createApplication } from '../../apps/api/dist/app';

const config = environment();
const admin = createPool();
const databaseName = `ocasio_test_${process.pid}_${Date.now()}`;
let pool: Pool;
let app: Awaited<ReturnType<typeof createApplication>>;
let base: string;

before(async () => {
  // Each run owns a newly named disposable database; never reset the configured one.
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const url = new URL(config.DATABASE_URL);
  url.pathname = `/${databaseName}`;
  pool = createPool(url.toString());
  for (const name of (await readdir('packages/database/migrations')).filter((file) => file.endsWith('.sql')).sort()) {
    await pool.query(await readFile(`packages/database/migrations/${name}`,'utf8'));
  }
  await pool.query(`INSERT INTO coverage_markets(id,slug,name) VALUES ($1,'karnal','Karnal')`,[randomUUID()]);
  app = await createApplication(parseEnvironment({...config,DATABASE_URL:url.toString()}),true);
  await app.listen(0,'127.0.0.1');
  base = await app.getUrl();
});

after(async () => {
  await app?.close();
  await pool?.end();
  // This generated name can only reference the database this test created.
  await admin.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
  await admin.end();
});

test('API reads real migrated market records through the shared contract',async () => {
  const response = await fetch(`${base}/api/v1/coverage`);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.ok(response.headers.get('x-request-id'));
  const result = CoverageResponseSchema.parse(await response.json());
  assert.equal(result.items[0]?.name,'Karnal');
  assert.equal(result.items[0]?.mode,'research');
});

test('validation and not-found errors are safe and correlated',async () => {
  for (const path of ['/coverage?limit=0','/coverage?limit=not-a-number','/coverage?unknown=x']) {
    const response = await fetch(`${base}/api/v1${path}`);
    assert.equal(response.status,400);
    const body = ApiErrorSchema.parse(await response.json());
    assert.equal(body.error.code,'VALIDATION_FAILED');
    assert.equal(body.error.requestId,response.headers.get('x-request-id'));
  }
  const missing = await fetch(`${base}/api/v1/bookings`);
  assert.equal(missing.status,404);
});

test('liveness and readiness distinguish running process and schema availability',async () => {
  assert.equal((await fetch(`${base}/api/v1/health/live`)).status,200);
  assert.equal((await fetch(`${base}/api/v1/health/ready`)).status,200);
  await pool.query('ALTER TABLE coverage_markets RENAME TO coverage_unavailable');
  try {
    assert.equal((await fetch(`${base}/api/v1/health/live`)).status,200);
    const response = await fetch(`${base}/api/v1/health/ready`);
    assert.equal(response.status,503);
    assert.equal(ApiErrorSchema.parse(await response.json()).error.code,'SERVICE_UNAVAILABLE');
    assert.equal((await fetch(`${base}/api/v1/coverage`)).status,503);
  } finally { await pool.query('ALTER TABLE coverage_unavailable RENAME TO coverage_markets'); }
});

test('OpenAPI documents the read-only coverage response and invalid origin gets no allow-origin',async () => {
  const response = await fetch(`${base}/api/docs-json`);
  assert.equal(response.status,200);
  const document = await response.json() as {paths:Record<string,unknown>};
  assert.ok(document.paths['/api/v1/coverage']);
  const cors = await fetch(`${base}/api/v1/coverage`,{headers:{Origin:'https://untrusted.example'}});
  assert.notEqual(cors.headers.get('access-control-allow-origin'),'https://untrusted.example');
  // No public mutation endpoint exists; CORS is not presented as CSRF protection.
  assert.equal((await fetch(`${base}/api/v1/coverage`,{method:'POST'})).status,404);
});

test('probe creation is idempotent under concurrent callers and audit commits once',async () => {
  const key = `probe-${randomUUID()}`;
  const ids = await Promise.all(Array.from({length:5},() => enqueueProbe(pool,key)));
  assert.equal(new Set(ids).size,1);
  const result = await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE resource_id=$1',[ids[0]]);
  assert.equal(result.rows[0].count,1);
});

test('concurrent workers process a queued event once; replay has one receipt',async () => {
  const id = await enqueueProbe(pool,`worker-${randomUUID()}`);
  await Promise.all(Array.from({length:6},() => processNextEvent(pool)));
  assert.equal((await pool.query('SELECT state FROM outbox_events WHERE id=$1',[id])).rows[0].state,'processed');
  await pool.query(`UPDATE outbox_events SET state='pending', available_at=now() WHERE id=$1`,[id]);
  assert.equal(await processNextEvent(pool),'processed');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM job_receipts WHERE event_id=$1',[id])).rows[0].count,1);
});

test('failed transaction leaves neither partial audit nor queued work',async () => {
  const id = randomUUID();
  await assert.rejects(transaction(pool,async (client) => {
    await client.query(`INSERT INTO audit_events(action,resource_id) VALUES ('test.rollback',$1)`,[id]);
    await client.query(`INSERT INTO outbox_events(id,topic,operation_key) VALUES ($1,'foundation.probe',$2)`,[id,`rollback-${id}`]);
    throw new Error('simulated failure');
  }));
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM audit_events WHERE resource_id=$1',[id])).rows[0].count,0);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM outbox_events WHERE id=$1',[id])).rows[0].count,0);
});

test('unsupported job retries with safe code then dead-letters instead of pretending delivery',async () => {
  const id = randomUUID();
  await pool.query(`INSERT INTO outbox_events(id,topic,operation_key) VALUES ($1,'not-supported',$2)`,[id,`unknown-${id}`]);
  for (let attempt=1; attempt<=5; attempt++) {
    await pool.query(`UPDATE outbox_events SET available_at=now() WHERE id=$1`,[id]);
    assert.equal(await processNextEvent(pool),attempt===5?'dead':'retry');
  }
  const result = (await pool.query('SELECT attempts,state,last_error_code FROM outbox_events WHERE id=$1',[id])).rows[0];
  assert.deepEqual(result,{attempts:5,state:'dead',last_error_code:'UNSUPPORTED_TOPIC'});
});
