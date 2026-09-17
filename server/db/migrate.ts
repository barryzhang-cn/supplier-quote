import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDb } from './client';

export async function runMigrations() {
  await migrate(getDb(), { migrationsFolder: 'drizzle' });
}

// 允许直接 `tsx server/db/migrate.ts` 一次性跑迁移
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runMigrations()
    .then(() => {
      console.log('migrations applied');
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
