import { createApplication } from './app';
import { environment } from '@ocasio/database';

async function main() {
  const config = environment();
  const app = await createApplication(config);
  await app.listen(config.API_PORT,config.API_HOST);
}
main().catch(() => { console.error('API startup failed. Check configuration; secret values are not logged.'); process.exitCode=1; });
