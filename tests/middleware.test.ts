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

  // TODO(Task 7): login 路由实现后，新增端到端用例覆盖
  // '停用账号无法 login'（loginToken 应返回 403 而非 200）
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

  // 成功路径：/api/auth/me 在 requireAuth 后面但不在 requireRole 后，可作为 happy path 锚点
  it('有效凭证 next() 成功（/api/auth/me 当前未挂 me handler，仅断言不 401/403）', async () => {
    const app = createApp(testDb);
    const { user } = await insertUser(testDb, { username: 'sup_ok' });
    const token = signToken({ sub: user.id, role: 'supplier' });
    const res = await request(app).get('/api/auth/me').set(auth(token));
    // 中间件通过 → 不返回 401/403；handler 路由未实现则返回 404，这是预期
    expect([200, 404]).toContain(res.status);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
