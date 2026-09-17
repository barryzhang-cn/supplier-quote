import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('管理员-供应商账号管理', () => {
  it('新建供应商账号成功（companyName 必填）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(token))
      .send({ username: 'sup1', password: 'InitPass!234', companyName: '甲公司' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ username: 'sup1', companyName: '甲公司', role: 'supplier' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('重复用户名返回 409', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(token))
      .send({ username: 'sup1', password: 'InitPass!234', companyName: '乙公司' });
    expect(res.status).toBe(409);
  });

  it('密码少于 8 位返回 422', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(token))
      .send({ username: 'sup2', password: '123', companyName: '乙公司' });
    expect(res.status).toBe(422);
  });

  it('列表只含供应商且不泄露密码哈希', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    await insertUser(testDb, { username: 'other_admin', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).get('/api/admin/users').set(auth(token));
    expect(res.status).toBe(200);
    const names = res.body.users.map((u: { username: string }) => u.username);
    expect(names).toContain('sup1');
    expect(names).not.toContain('boss');
    expect(names).not.toContain('other_admin');
    expect(res.body.users[0]).not.toHaveProperty('passwordHash');
  });

  it('重置密码后新密码可登录、旧密码失效', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const { user } = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .patch(`/api/admin/users/${user.id}`)
      .set(auth(token))
      .send({ password: 'NewPass!5678' });
    expect(res.status).toBe(200);
    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'NewPass!5678' });
    expect(newLogin.status).toBe(200);
    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'Passw0rd!123' });
    expect(oldLogin.status).toBe(401);
  });

  it('停用供应商后无法登录', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const { user } = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).patch(`/api/admin/users/${user.id}`).set(auth(token)).send({ active: false });
    expect(res.status).toBe(200);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'Passw0rd!123' });
    expect(login.status).toBe(403);
  });
});
