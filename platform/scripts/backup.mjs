import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { once } from 'node:events';

await mkdir('backups', { recursive: true, mode: 0o700 });
const file = `backups/ocasio-${new Date().toISOString().replaceAll(':','-')}.sql`;
const child = spawn('docker', ['compose','exec','-T','db','pg_dump','-U','ocasio','--no-owner','--no-privileges','ocasio_dev'], {stdio:['ignore','pipe','pipe']});
child.stderr.resume();
try {
  const completion = once(child,'close');
  await pipeline(child.stdout,createWriteStream(file,{mode:0o600}));
  const [code] = await completion;
  if (code !== 0) throw new Error('pg_dump failed');
  console.log(`Local backup saved: ${file}. Treat it as private; restore procedure is in docs/LOCAL-RUNBOOK.md.`);
} catch {
  await rm(file,{force:true});
  console.error('Backup failed. Check local Docker/PostgreSQL; incomplete output removed.');
  process.exitCode=1;
}
