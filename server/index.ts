import 'dotenv/config';
import { createApp } from './app';
import { closeDb } from './db/client';
import { runMigrations } from './db/migrate';
import { seedAdmin } from './seed';
import { db } from './db/client';

const port = Number(process.env.PORT ?? 3000);

async function main() {
  await runMigrations();
  await seedAdmin(db);
  const app = createApp(db);
  app.listen(port, () => {
    console.log(`supplier-quote 已启动: http://0.0.0.0:${port}`);
  });
}

main().catch(async (err) => {
  console.error('启动失败:', err);
  await closeDb().catch(() => {});
  process.exit(1);
});
