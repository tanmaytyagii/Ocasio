import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPool } from '@ocasio/database';

async function main() {
  const pool = createPool();
  const client = await pool.connect();
  try {
    await client.query(`SELECT pg_advisory_lock(74291301)`);
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const directory = resolve('packages/database/migrations');
    for (const name of (await readdir(directory)).filter((file) => file.endsWith('.sql')).sort()) {
      const sql = await readFile(resolve(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = await client.query<{checksum:string}>('SELECT checksum FROM schema_migrations WHERE name=$1', [name]);
      if (prior.rows[0]) {
        if (prior.rows[0].checksum !== checksum) throw new Error(`Applied migration changed: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1,$2)', [name,checksum]);
        await client.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(74291301)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}
main().catch(() => { console.error('Migration failed. Check connectivity and migration consistency; credentials are not logged.'); process.exitCode=1; });
