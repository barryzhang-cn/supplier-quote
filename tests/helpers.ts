import request from 'supertest';
import type { Express } from 'express';
import { users } from '../server/db/schema';
import { hashPassword } from '../server/auth/password';
import type { Db } from '../server/db/client';

export async function insertUser(
  db: Db,
  opts: {
    username: string;
    role?: 'admin' | 'supplier';
    companyName?: string | null;
    active?: boolean;
    password?: string;
  },
) {
  const password = opts.password ?? 'Passw0rd!123';
  const [u] = await db
    .insert(users)
    .values({
      username: opts.username,
      passwordHash: hashPassword(password),
      role: opts.role ?? 'supplier',
      companyName: opts.companyName ?? null,
      active: opts.active ?? true,
    })
    .returning();
  return { user: u, password };
}

export async function loginToken(app: Express, username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
