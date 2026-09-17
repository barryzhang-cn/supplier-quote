import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb, rawClient } from './setup';
import { insertUser, loginToken, auth } from './helpers';

async function setupAdminAndBuyer() {
  const app = createApp(testDb);
  const boss = await insertUser(testDb, { username: 'boss', role: 'admin' });
  const buyer1 = await insertUser(testDb, {
    username: 'buyer1',
    role: 'procurement',
    createdBy: boss.user.id,
  });
  const buyer2 = await insertUser(testDb, {
    username: 'buyer2',
    role: 'procurement',
    createdBy: boss.user.id,
  });
  const supA = await insertUser(testDb, { username: 'sup_a', companyName: '甲公司' });
  const supB = await insertUser(testDb, { username: 'sup_b', companyName: '乙公司' });
  const supC = await insertUser(testDb, {
    username: 'sup_c',
    companyName: '丙公司',
    createdBy: buyer1.user.id,
  });
  const bossTok = await loginToken(app, 'boss', 'Passw0rd!123');
  const buyer1Tok = await loginToken(app, 'buyer1', 'Passw0rd!123');
  return {
    app,
    boss: boss.user,
    buyer1: buyer1.user,
    buyer2: buyer2.user,
    supA: supA.user,
    supB: supB.user,
    supC: supC.user,
    bossTok,
    buyer1Tok,
  };
}

describe('POST /admin/users 角色创建权限', () => {
  it('admin 可创建 admin', async () => {
    const { app, bossTok } = await setupAdminAndBuyer();
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(bossTok))
      .send({ username: 'new_admin', password: 'Admin!23456', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });

  it('procurement 不能创建 admin（403）', async () => {
    const { app, buyer1Tok } = await setupAdminAndBuyer();
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(buyer1Tok))
      .send({ username: 'wannabe_admin', password: 'Admin!23456', role: 'admin' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/无权创建/);
  });

  it('procurement 可创建 supplier', async () => {
    const { app, buyer1Tok } = await setupAdminAndBuyer();
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(buyer1Tok))
      .send({ username: 'new_sup', password: 'Sup!234567', role: 'supplier', companyName: '新供应商' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('supplier');
  });

  it('procurement 可创建 procurement', async () => {
    const { app, buyer1Tok } = await setupAdminAndBuyer();
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(buyer1Tok))
      .send({ username: 'new_buyer', password: 'Buy!234567', role: 'procurement', companyName: '新采购' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('procurement');
  });

  it('POST 用户时自动记录 created_by = 当前 actor', async () => {
    const { app, buyer1, buyer1Tok } = await setupAdminAndBuyer();
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(buyer1Tok))
      .send({ username: 'sup_by_buyer1', password: 'Sup!234567', role: 'supplier', companyName: 'X' });
    expect(res.status).toBe(201);
    const list = await request(app).get('/api/admin/users').set(auth(buyer1Tok));
    const u = list.body.users.find((x: { username: string }) => x.username === 'sup_by_buyer1');
    expect(u).toBeDefined();
    expect(u.createdBy).toBe(buyer1.id);
  });
});

describe('GET /admin/users 列表范围', () => {
  it('admin 看到全部账号（含其他 admin / procurement）', async () => {
    const { app, bossTok, supA, supB, supC, buyer1 } = await setupAdminAndBuyer();
    const res = await request(app).get('/api/admin/users').set(auth(bossTok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(expect.arrayContaining(['boss', 'buyer1', 'buyer2', 'sup_a', 'sup_b', 'sup_c']));
  });

  it('procurement 看到所有 supplier + 自己创建的账号（但看不到其他 procurement 创建的 supplier 之外的）', async () => {
    const { app, buyer1Tok, supA, supB, supC } = await setupAdminAndBuyer();
    const res = await request(app).get('/api/admin/users').set(auth(buyer1Tok));
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toEqual(expect.arrayContaining(['sup_a', 'sup_b', 'sup_c']));
    expect(names).not.toContain('buyer2'); // 同角色 buyer2 不在 buyer1 视野
    expect(names).not.toContain('boss'); // admin 也不在视野
  });

  it('procurement 创建的新账号即时出现在自己列表', async () => {
    const { app, buyer1Tok } = await setupAdminAndBuyer();
    await request(app)
      .post('/api/admin/users')
      .set(auth(buyer1Tok))
      .send({ username: 'sup_my_creation', password: 'Sup!234567', role: 'supplier', companyName: 'Y' });
    const list = await request(app).get('/api/admin/users').set(auth(buyer1Tok));
    expect(
      list.body.users.find((u: { username: string }) => u.username === 'sup_my_creation'),
    ).toBeDefined();
  });
});

describe('PATCH /admin/users/:id 修改权限', () => {
  it('procurement 可重置自己创建的 supplier 密码', async () => {
    const { app, buyer1, buyer1Tok, supC } = await setupAdminAndBuyer();
    const res = await request(app)
      .patch(`/api/admin/users/${supC.id}`)
      .set(auth(buyer1Tok))
      .send({ password: 'NewPass!23456' });
    expect(res.status).toBe(200);
  });

  it('procurement 不能重置其他 procurement 创建的 supplier 密码（403）', async () => {
    const { app, buyer1Tok, supA } = await setupAdminAndBuyer();
    const res = await request(app)
      .patch(`/api/admin/users/${supA.id}`)
      .set(auth(buyer1Tok))
      .send({ password: 'NewPass!23456' });
    expect(res.status).toBe(403);
  });

  it('procurement 不能修改 admin 账号（403）', async () => {
    const { app, buyer1Tok, boss } = await setupAdminAndBuyer();
    const res = await request(app)
      .patch(`/api/admin/users/${boss.id}`)
      .set(auth(buyer1Tok))
      .send({ password: 'Hacked!23456' });
    expect(res.status).toBe(403);
  });

  it('任何角色都不能修改自己的 role（防降权）', async () => {
    const { app, bossTok, boss } = await setupAdminAndBuyer();
    const res = await request(app)
      .patch(`/api/admin/users/${boss.id}`)
      .set(auth(bossTok))
      .send({ role: 'supplier' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/不能修改自己的角色/);
  });

  it('admin 可以修改任何人的 role', async () => {
    const { app, bossTok, buyer2 } = await setupAdminAndBuyer();
    const res = await request(app)
      .patch(`/api/admin/users/${buyer2.id}`)
      .set(auth(bossTok))
      .send({ role: 'supplier' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('supplier');
  });

  it('procurement 不能修改任何 admin 账号', async () => {
    const { app, buyer1Tok, boss } = await setupAdminAndBuyer();
    const res = await request(app)
      .patch(`/api/admin/users/${boss.id}`)
      .set(auth(buyer1Tok))
      .send({ active: false });
    expect(res.status).toBe(403);
  });
});
