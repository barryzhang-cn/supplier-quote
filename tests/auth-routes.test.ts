import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

describe('POST /api/auth/login', () => {
  it('正确凭据返回 token 和用户信息', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup1', password: 'Passw0rd!123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user).toMatchObject({ username: 'sup1', role: 'supplier', companyName: '甲公司' });
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('密码错误返回 401', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup1' });
    const res = await request(app).post('/api/auth/login').send({ username: 'sup1', password: 'nope' });
    expect(res.status).toBe(401);
  });

  it('不存在的用户返回 401', async () => {
    const app = createApp(testDb);
    const res = await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'x' });
    expect(res.status).toBe(401);
  });

  it('停用账号返回 403', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'sup2', active: false });
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'sup2', password: 'Passw0rd!123' });
    expect(res.status).toBe(403);
  });

  it('参数缺失返回 422', async () => {
    const app = createApp(testDb);
    const res = await request(app).post('/api/auth/login').send({ username: 'sup1' });
    expect(res.status).toBe(422);
  });
});

describe('GET /api/auth/me', () => {
  it('有效 token 返回当前用户', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const token = await loginToken(app, 'boss', 'Passw0rd!123');
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('boss');
    expect(res.body.user.role).toBe('admin');
  });
});
