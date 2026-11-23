import { randomBytes } from 'node:crypto';
import { chmod, readFile, writeFile } from 'node:fs/promises';

let value;
try { value = await readFile('.env','utf8'); }
catch (error) {
  if (error.code !== 'ENOENT') throw error;
  value = await readFile('.env.example','utf8');
}
const match = value.match(/^SESSION_SECRET=(.*)$/m);
if (!match || !match[1]?.trim()) {
  const entry = `SESSION_SECRET=${randomBytes(48).toString('hex')}`;
  value = match ? value.replace(/^SESSION_SECRET=.*$/m,entry) : `${value.trimEnd()}\n${entry}\n`;
  await writeFile('.env',value,{mode:0o600});
  console.log('Local configuration prepared with a random session secret. Existing settings preserved; no secret printed.');
} else {
  console.log('Existing local configuration preserved; session secret not changed or printed.');
}
await chmod('.env',0o600);
