import { createHash, createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { Pool, type PoolClient } from 'pg';
import { parseEnvironment } from '@ocasio/contracts';

export function environment() {
  config({ path: resolve(__dirname, '../../../.env'), quiet: true });
  return parseEnvironment(process.env);
}

export function createPool(databaseUrl = environment().DATABASE_URL) {
  return new Pool({ connectionString: databaseUrl, max: 5, connectionTimeoutMillis: 3000, statement_timeout: 5000, application_name: 'ocasio-foundation' });
}

export async function transaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** Internal CLI probe, never a public or customer-authentication endpoint. */
export async function enqueueProbe(pool: Pool, operationKey: string) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(operationKey)) throw new Error('Invalid probe operation key');
  return transaction(pool, async (client) => {
    const result = await client.query<{ id: string }>(
      `INSERT INTO outbox_events (id, topic, operation_key, payload)
       VALUES ($1, 'foundation.probe', $2, '{}'::jsonb)
       ON CONFLICT (operation_key) DO NOTHING RETURNING id`, [randomUUID(), operationKey],
    );
    if (result.rows[0]) {
      await client.query(`INSERT INTO audit_events (action, resource_id) VALUES ('foundation.probe.enqueued', $1)`, [result.rows[0].id]);
      return result.rows[0].id;
    }
    const existing = await client.query<{id: string}>('SELECT id FROM outbox_events WHERE operation_key=$1', [operationKey]);
    return existing.rows[0]!.id;
  });
}

/** Lock and apply a small DB-only handler in one transaction; no external side effects. */
export async function processNextEvent(pool: Pool): Promise<'idle' | 'processed' | 'retry' | 'dead'> {
  return transaction(pool, async (client) => {
    const result = await client.query<{id:string;topic:string;attempts:number}>(
      `SELECT id, topic, attempts FROM outbox_events
       WHERE state='pending' AND available_at <= now()
       ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1`,
    );
    const event = result.rows[0];
    if (!event) return 'idle';
    if (event.topic !== 'foundation.probe') {
      const attempts = event.attempts + 1;
      const state = attempts >= 5 ? 'dead' : 'pending';
      await client.query(
        `UPDATE outbox_events SET attempts=$2, state=$3, last_error_code='UNSUPPORTED_TOPIC',
         available_at=now()+make_interval(secs => $4) WHERE id=$1`,
        [event.id, attempts, state, Math.min(2 ** attempts, 60)],
      );
      return state === 'dead' ? 'dead' : 'retry';
    }
    await client.query(`INSERT INTO job_receipts (event_id, handler) VALUES ($1, 'foundation.probe') ON CONFLICT DO NOTHING`, [event.id]);
    await client.query(`UPDATE outbox_events SET state='processed', processed_at=now(), attempts=attempts+1 WHERE id=$1`, [event.id]);
    return 'processed';
  });
}

const mailKey = (secret: string) => createHash('sha256').update('ocasio-auth-mail-v1:'+secret).digest();
export function encryptMail(payload: {to:string;subject:string;text:string}, secret:string) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',mailKey(secret),iv);
  const data=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return ['v1',iv.toString('base64url'),cipher.getAuthTag().toString('base64url'),data.toString('base64url')].join('.');
}
export function decryptMail(value:string,secret:string):{to:string;subject:string;text:string} {
  const [version,iv,tag,data]=value.split('.');
  if(version!=='v1'||!iv||!tag||!data) throw new Error('INVALID_MAIL');
  const decipher=createDecipheriv('aes-256-gcm',mailKey(secret),Buffer.from(iv,'base64url'));
  decipher.setAuthTag(Buffer.from(tag,'base64url'));
  const payload=JSON.parse(Buffer.concat([decipher.update(Buffer.from(data,'base64url')),decipher.final()]).toString('utf8'));
  if(!payload || !['to','subject','text'].every(key=>typeof payload[key]==='string')) throw new Error('INVALID_MAIL');
  return payload;
}
