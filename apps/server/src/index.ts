/** Server entry point. */

import { config } from './config.ts';
import { getDb } from './db/index.ts';
import { createApp } from './app.ts';

const db = getDb();
const app = await createApp({ db, logger: true });

try {
  await app.listen({ port: config.port, host: config.host });
  app.log.info({ dataDir: config.dataDir }, 'nalepko is ready');
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close();
    db.close();
    process.exit(0);
  });
}
