import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, auth } from './helpers';
import { signToken } from '../server/auth/jwt';
import { users } from '../server/db/schema';

describe('requireAuth / requireRole', () => {
  it('无 token 访问受保护接口返回 401', async () => {
    const app = createApp(testDb);
    const res = await request(app).get('/api/tenders');
    expect(res.status).toBe(401);
  });

  it('无效 token 返回 401', async () => {
    const app = createApp(testDb);
    const res = await request(app).get('/api/tenders').set(auth('bad-token'));
    expect(res.status).toBe(401);
  });

  it('停用账号即使 token 有效也返回 403', async () => {
    const app = createApp(testDb);
    const { user } = await insertUser(testDb, { username: 'sup1', active: true });
    const token = signToken({ sub: user.id, role: 'supplier' });
    await testDb.update(users).set({ active: false }).where(eq(users.id, user.id));
    const res = await request(app).get('/api/tenders').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('供应商访问管理员接口返回 403', async () => {
    const app = createApp(testDb);
    const { user } = await insertUser(testDb, { username: 'sup1' });
    const token = signToken({ sub: user.id, role: 'supplier' });
    const res = await request(app).get('/api/admin/users').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('管理员访问供应商接口返回 403', async () => {
    const app = createApp(testDb);
    const { user } = await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = signToken({ sub: user.id, role: 'admin' });
    const res = await request(app).get('/api/tenders').set(auth(token));
    expect(res.status).toBe(403);
  });
});