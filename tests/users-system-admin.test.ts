import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth, insertTenderForAllSuppliers } from './helpers';
import { users } from '../server/db/schema';

describe('系统管理员账号保护', () => {
  it('GET /admin/users 不返回系统管理员账号（admin 视角）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' }); // 系统管理员
    await insertUser(testDb, { username: 'boss2', role: 'admin' }); // 另一个 admin
    await insertUser(testDb, { username: 'sup1', companyName: '甲' });
    const tok = await loginToken(app, 'boss2', 'Passw0rd!123');
    const res = await request(app).get('/api/admin/users').set(auth(tok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(expect.arrayContaining(['boss2', 'sup1']));
    expect(names).not.toContain('admin'); // 系统管理员被隐藏
  });

  it('GET /admin/users 也不向 procurement 暴露系统管理员', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    await insertUser(testDb, { username: 'buyer', role: 'procurement' });
    const tok = await loginToken(app, 'buyer', 'Passw0rd!123');
    const res = await request(app).get('/api/admin/users').set(auth(tok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).not.toContain('admin');
  });

  it('PATCH /admin/users/:id 拒绝修改系统管理员账号（即使是 admin 自己）', async () => {
    const app = createApp(testDb);
    const sysAdmin = await insertUser(testDb, { username: 'admin', role: 'admin' });
    const tok = await loginToken(app, 'admin', 'Passw0rd!123');
    const res = await request(app)
      .patch(`/api/admin/users/${sysAdmin.user.id}`)
      .set(auth(tok))
      .send({ password: 'NewAdmin!23456' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/系统管理员.*保护/);
  });

  it('POST /admin/users 拒绝创建与系统管理员同名账号', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const tok = await loginToken(app, 'admin', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(tok))
      .send({ username: 'admin', password: 'Imposter!1234', role: 'admin' });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/系统保留/);
  });

  it('DELETE /admin/users/:id 拒绝删除系统管理员', async () => {
    const app = createApp(testDb);
    const sysAdmin = await insertUser(testDb, { username: 'admin', role: 'admin' });
    const tok = await loginToken(app, 'admin', 'Passw0rd!123');
    const res = await request(app)
      .delete(`/api/admin/users/${sysAdmin.user.id}`)
      .set(auth(tok));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/系统管理员.*保护/);
  });

  it('DELETE 拒绝删除自己', async () => {
    const app = createApp(testDb);
    const boss = await insertUser(testDb, { username: 'boss2', role: 'admin' });
    const tok = await loginToken(app, 'boss2', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${boss.user.id}`).set(auth(tok));
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/不能删除自己的账号/);
  });
});

describe('DELETE /admin/users/:id', () => {
  it('admin 删除无数据的 supplier（204）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const sup = await insertUser(testDb, { username: 'todel', companyName: '目标' });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${sup.user.id}`).set(auth(tok));
    expect(res.status).toBe(204);
    const after = await request(app).get('/api/admin/users').set(auth(tok));
    expect(after.body.users.find((u: { id: string }) => u.id === sup.user.id)).toBeUndefined();
  });

  it('admin 删除有招标数据的 procurement（409，提示关联）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const owner = await insertUser(testDb, { username: 'tender_owner', companyName: '创建者', role: 'procurement' });
    await insertTenderForAllSuppliers(testDb, { deadline: new Date(Date.now() + 86400_000), createdBy: owner.user.id });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${owner.user.id}`).set(auth(tok));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/关联数据/);
    expect(res.body.error).toMatch(/1 个招标/);
  });

  it('admin 删除 procurement 时自动将其创建的 supplier 的 created_by 置 NULL', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer_x', role: 'procurement' });
    const created = await insertUser(testDb, {
      username: 'sub_sup',
      companyName: '下属',
      role: 'supplier',
      createdBy: buyer.user.id,
    });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${buyer.user.id}`).set(auth(tok));
    expect(res.status).toBe(204);
    const [row] = await testDb
      .select({ createdBy: users.createdBy })
      .from(users)
      .where(eq(users.id, created.user.id));
    expect(row?.createdBy).toBeNull();
  });

  it('procurement 可删除自己创建的 supplier（204）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
    const target = await insertUser(testDb, { username: 'target', companyName: 'T', createdBy: buyer.user.id });
    const tok = await loginToken(app, 'buyer', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${target.user.id}`).set(auth(tok));
    expect(res.status).toBe(204);
  });

  it('admin 删除另一个 admin（非系统）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const victim = await insertUser(testDb, { username: 'admin2', role: 'admin' });
    const tok = await loginToken(app, 'admin', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${victim.user.id}`).set(auth(tok));
    expect(res.status).toBe(204);
  });
});