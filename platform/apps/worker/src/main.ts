import { setTimeout } from 'node:timers/promises';
import { createPool, processNextEvent, environment } from '@ocasio/database';

import { processAuthMail } from './auth-mail';

async function main() {
  const config = environment();
  const pool = createPool(config.DATABASE_URL);
  let running = true;
  process.on('SIGTERM', () => { running=false; });
  process.on('SIGINT', () => { running=false; });
  pool.on('error', () => console.error(JSON.stringify({event:'worker.database_error'})));
  console.log(JSON.stringify({event:'worker.started',handler:'foundation.probe'}));
  try {
    while(running) {
      try {
        const state = await processNextEvent(pool);
        const mail = await processAuthMail(pool,config);
        if (state !== 'idle') console.log(JSON.stringify({event:'worker.tick',state}));
        if (state === 'idle' && mail === 'idle') await setTimeout(1000);
      } catch {
        console.error(JSON.stringify({event:'worker.retry',code:'DATABASE_UNAVAILABLE'}));
        await setTimeout(3000);
      }
    }
  } finally { await pool.end(); }
}
main().catch(() => { console.error('Worker startup failed; check configuration.'); process.exitCode=1; });
