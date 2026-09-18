import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('GET /admin/users 搜索 + 创建者', () => {
  async function setup() {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' }); // 系统管理员（隐藏）
    const boss = await insertUser(testDb, { username: 'boss', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement', createdBy: boss.user.id });
    await insertUser(testDb, { username: 'alpha_co', companyName: '甲公司' });
    await insertUser(testDb, { username: 'beta_co', companyName: '乙公司' });
    await insertUser(testDb, { username: 'gamma_co', companyName: '丙公司' });
    await insertUser(testDb, { username: 'special', companyName: 'alpha_special' });
    const bossTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const buyerTok = await loginToken(app, 'buyer', 'Passw0rd!123');
    return { app, boss, buyer, bossTok, buyerTok };
  }

  it('admin 无 q 时返回全部非系统账号（含 createdByUsername 字段）', async () => {
    const { app, boss, bossTok } = await setup();
    const res = await request(app).get('/api/admin/users').set(auth(bossTok));
    expect(res.status).toBe(200);
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(expect.arrayContaining(['boss', 'buyer', 'alpha_co', 'beta_co', 'gamma_co', 'special']));
    expect(names).not.toContain('admin'); // 系统管理员仍然隐藏
    // buyer 是 boss 创建的
    const buyerRow = res.body.users.find((u: { username: string }) => u.username === 'buyer');
    expect(buyerRow.createdByUsername).toBe('boss');
    // 系统账号 created_by = NULL，createdByUsername = NULL
    const bossRow = res.body.users.find((u: { username: string }) => u.username === 'boss');
    expect(bossRow.createdByUsername).toBeNull();
  });

  it('admin q=alpha 命中用户名与公司名', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app).get('/api/admin/users?q=alpha').set(auth(bossTok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(expect.arrayContaining(['alpha_co', 'special']));
    expect(names).not.toContain('beta_co');
    expect(names).not.toContain('gamma_co');
  });

  it('admin q=甲 命中中文公司名（大小写不敏感）', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app).get('/api/admin/users?q=' + encodeURIComponent('甲')).set(auth(bossTok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(['alpha_co']);
  });

  it('admin q 不匹配任何时返回空数组', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app).get('/api/admin/users?q=zzz').set(auth(bossTok));
    expect(res.body.users).toEqual([]);
  });

  it('procurement 的 q 也只在可见范围内过滤', async () => {
    const { app, buyerTok } = await setup();
    // buyer（procurement）能看到所有 supplier；看不到 boss（admin）
    const res = await request(app).get('/api/admin/users?q=co').set(auth(buyerTok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(expect.arrayContaining(['alpha_co', 'beta_co', 'gamma_co']));
    expect(names).not.toContain('boss');
  });
});

describe('DELETE /admin/users/:id procurement 删自己创建的 supplier', () => {
  it('procurement 可删除自己创建的 supplier（204）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
    const target = await insertUser(testDb, {
      username: 'todel',
      companyName: 'T',
      createdBy: buyer.user.id,
    });
    const tok = await loginToken(app, 'buyer', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${target.user.id}`).set(auth(tok));
    expect(res.status).toBe(204);
  });

  it('procurement 不能删除别人创建的 supplier（403）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer1 = await insertUser(testDb, { username: 'buyer1', role: 'procurement' });
    const buyer2 = await insertUser(testDb, { username: 'buyer2', role: 'procurement', createdBy: buyer1.user.id });
    const target = await insertUser(testDb, {
      username: 'todel',
      companyName: 'T',
      createdBy: buyer2.user.id, // buyer2 创建的
    });
    const tok = await loginToken(app, 'buyer1', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${target.user.id}`).set(auth(tok));
    expect(res.status).toBe(403);
  });

  it('procurement 可删除自己创建的 procurement（204）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
    const target = await insertUser(testDb, {
      username: 'buyer2',
      role: 'procurement',
      companyName: 'T',
      createdBy: buyer.user.id,
    });
    const tok = await loginToken(app, 'buyer', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${target.user.id}`).set(auth(tok));
    expect(res.status).toBe(204);
  });

  it('procurement 可重置自己创建的 procurement 密码', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
    const target = await insertUser(testDb, {
      username: 'buyer2',
      role: 'procurement',
      companyName: 'T',
      createdBy: buyer.user.id,
    });
    const tok = await loginToken(app, 'buyer', 'Passw0rd!123');
    const res = await request(app)
      .patch(`/api/admin/users/${target.user.id}`)
      .set(auth(tok))
      .send({ password: 'NewPass!23456' });
    expect(res.status).toBe(200);
  });

  it('procurement 可停用自己创建的 procurement', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
    const target = await insertUser(testDb, {
      username: 'buyer2',
      role: 'procurement',
      companyName: 'T',
      createdBy: buyer.user.id,
    });
    const tok = await loginToken(app, 'buyer', 'Passw0rd!123');
    const res = await request(app)
      .patch(`/api/admin/users/${target.user.id}`)
      .set(auth(tok))
      .send({ active: false });
    expect(res.status).toBe(200);
    expect(res.body.user.active).toBe(false);
  });

  it('procurement 不能重置他人创建的 procurement 密码（403）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer1 = await insertUser(testDb, { username: 'buyer1', role: 'procurement' });
    const buyer2 = await insertUser(testDb, { username: 'buyer2', role: 'procurement' });
    const target = await insertUser(testDb, {
      username: 'buyer3',
      role: 'procurement',
      companyName: 'T',
      createdBy: buyer2.user.id,
    });
    const tok = await loginToken(app, 'buyer1', 'Passw0rd!123');
    const res = await request(app)
      .patch(`/api/admin/users/${target.user.id}`)
      .set(auth(tok))
      .send({ password: 'Hacked!23456' });
    expect(res.status).toBe(403);
  });

  it('procurement 不能删除他人创建的 procurement（403）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'admin', role: 'admin' });
    const buyer1 = await insertUser(testDb, { username: 'buyer1', role: 'procurement' });
    const buyer2 = await insertUser(testDb, { username: 'buyer2', role: 'procurement' });
    const target = await insertUser(testDb, {
      username: 'buyer3',
      role: 'procurement',
      companyName: 'T',
      createdBy: buyer2.user.id,
    });
    const tok = await loginToken(app, 'buyer1', 'Passw0rd!123');
    const res = await request(app).delete(`/api/admin/users/${target.user.id}`).set(auth(tok));
    expect(res.status).toBe(403);
  });
});