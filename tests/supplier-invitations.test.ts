import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb, rawClient } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, users } from '../server/db/schema';

describe('供应商-邀请隔离', () => {
  it('未邀请者看不到该招标（列表中不出现）', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const supInvited = await insertUser(testDb, { username: 'invited', companyName: '已邀' });
    const supExcluded = await insertUser(testDb, { username: 'excluded', companyName: '未邀' });
    const adminTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(adminTok))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supInvited.user.id],
      });
    const tid = create.body.tender.id;
    const invTok = await loginToken(app, 'invited', 'Passw0rd!123');
    const exTok = await loginToken(app, 'excluded', 'Passw0rd!123');
    const invList = await request(app).get('/api/tenders').set(auth(invTok));
    const exList = await request(app).get('/api/tenders').set(auth(exTok));
    expect(invList.body.tenders.find((t: { id: string }) => t.id === tid)).toBeDefined();
    expect(exList.body.tenders.find((t: { id: string }) => t.id === tid)).toBeUndefined();
  });

  it('未邀请者详情返回 404', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const supInvited = await insertUser(testDb, { username: 'invited', companyName: '已邀' });
    const supExcluded = await insertUser(testDb, { username: 'excluded', companyName: '未邀' });
    const adminTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(adminTok))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supInvited.user.id],
      });
    const tid = create.body.tender.id;
    const invTok = await loginToken(app, 'invited', 'Passw0rd!123');
    const exTok = await loginToken(app, 'excluded', 'Passw0rd!123');
    const invDetail = await request(app).get(`/api/tenders/${tid}`).set(auth(invTok));
    const exDetail = await request(app).get(`/api/tenders/${tid}`).set(auth(exTok));
    expect(invDetail.status).toBe(200);
    expect(exDetail.status).toBe(404);
  });

  it('未邀请者 PUT quote 返回 403', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const supInvited = await insertUser(testDb, { username: 'invited', companyName: '已邀' });
    const supExcluded = await insertUser(testDb, { username: 'excluded', companyName: '未邀' });
    const adminTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(adminTok))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supInvited.user.id],
      });
    const tid = create.body.tender.id;
    const exTok = await loginToken(app, 'excluded', 'Passw0rd!123');
    const res = await request(app)
      .put(`/api/tenders/${tid}/quote`)
      .set(auth(exTok))
      .send({ amount: '88.88' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/未受邀/);
  });

  it('未邀请者 GET ranking 返回 404', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const supInvited = await insertUser(testDb, { username: 'invited', companyName: '已邀' });
    const supExcluded = await insertUser(testDb, { username: 'excluded', companyName: '未邀' });
    const adminTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(adminTok))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supInvited.user.id],
      });
    const tid = create.body.tender.id;
    const exTok = await loginToken(app, 'excluded', 'Passw0rd!123');
    const res = await request(app).get(`/api/tenders/${tid}/ranking`).set(auth(exTok));
    expect(res.status).toBe(404);
  });

  it('未邀请者 GET quote 返回 404', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const supInvited = await insertUser(testDb, { username: 'invited', companyName: '已邀' });
    const supExcluded = await insertUser(testDb, { username: 'excluded', companyName: '未邀' });
    const adminTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(adminTok))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supInvited.user.id],
      });
    const tid = create.body.tender.id;
    const exTok = await loginToken(app, 'excluded', 'Passw0rd!123');
    const res = await request(app).get(`/api/tenders/${tid}/quote`).set(auth(exTok));
    expect(res.status).toBe(404);
  });

  it('被移除邀请的供应商历史报价在管理员账面上保留', async () => {
    const app = createApp(testDb);
    await insertUser(testDb, { username: 'boss', role: 'admin' });
    const sup = await insertUser(testDb, { username: 'sup', companyName: '甲' });
    const adminTok = await loginToken(app, 'boss', 'Passw0rd!123');
    const tenderRes = await request(app)
      .post('/api/admin/tenders')
      .set(auth(adminTok))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [sup.user.id],
      });
    const tid = tenderRes.body.tender.id;
    const supTok = await loginToken(app, 'sup', 'Passw0rd!123');
    await request(app).put(`/api/tenders/${tid}/quote`).set(auth(supTok)).send({ amount: '88.88' });
    await request(app)
      .delete(`/api/admin/tenders/${tid}/invitations/${sup.user.id}`)
      .set(auth(adminTok));
    const res = await request(app).get(`/api/tenders/${tid}/quote`).set(auth(supTok));
    expect(res.status).toBe(404);
    const detail = await request(app).get(`/api/admin/tenders/${tid}`).set(auth(adminTok));
    expect(detail.body.quotes).toHaveLength(1);
    expect(detail.body.quotes[0].supplierId).toBe(sup.user.id);
  });
});
