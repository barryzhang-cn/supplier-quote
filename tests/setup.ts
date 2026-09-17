import 'dotenv/config';
import { beforeAll, beforeEach, afterAll } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from '../server/db/schema';

process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';

const url = new URL(
  process.env.DATABASE_URL ?? 'postgres://supplier_quote@localhost:5432/supplier_quote',
);
url.pathname = '/supplier_quote_test';
process.env.DATABASE_URL = url.toString();

export const rawClient = postgres(process.env.DATABASE_URL, { max: 1 });
export const testDb = drizzle(rawClient, { schema });

beforeAll(async () => {
  await migrate(testDb, { migrationsFolder: 'drizzle' });
});

beforeEach(async () => {
  await rawClient`TRUNCATE quotes, tenders, users CASCADE`;
});

afterAll(async () => {
  await rawClient.end();
});
