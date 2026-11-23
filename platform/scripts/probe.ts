import { createPool, enqueueProbe, environment } from '@ocasio/database';

async function main() {
  if (environment().NODE_ENV === 'production') throw new Error('Development probe is disabled in production');
  const pool = createPool();
  try {
    const key = process.argv[2] ?? 'local-foundation-probe';
    const id = await enqueueProbe(pool, key);
    console.log(`Queued foundation probe ${id}; repeating the same key reuses this event.`);
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Probe failed; no sensitive configuration was logged.'); process.exitCode=1; });
