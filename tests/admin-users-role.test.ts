import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('POST /admin/users role 字段', () => {
  it('默认 role=supplier', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(tok))
      .send({ username: 's1', password: 'InitPass!234', companyName: '甲' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('supplier');
  });

  it('显式 role=procurement 可创建', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(tok))
      .send({
        username: 'buyer',
        password: 'InitPass!234',
        companyName: '采购员',
        role: 'procurement',
      });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('procurement');
  });

  it('显式 role=admin 可创建', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(tok))
      .send({ username: 'boss2', password: 'InitPass!234', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('admin');
  });

  it('非法 role 返回 422', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const tok = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(tok))
      .send({ username: 'x', password: 'InitPass!234', role: 'hacker' });
    expect(res.status).toBe(422);
  });
});
