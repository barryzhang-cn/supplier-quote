import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Db = PostgresJsDatabase<typeof schema>;

let client: postgres.Sql | null = null;
let _db: Db | null = null;

export function getDb(): Db {
  if (!_db) {
    client = postgres(process.env.DATABASE_URL!, { max: 10 });
    _db = drizzle(client, { schema });
  }
  return _db;
}

export const db: Db = new Proxy({} as Db, {
  get(_t, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});

export async function closeDb() {
  await client?.end();
  client = null;
  _db = null;
}
