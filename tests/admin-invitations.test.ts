import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';

async function admin() {
  const app = createApp(testDb);
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const token = await loginToken(app, 'boss', 'Passw0rd!123');
  return { app, token };
}

describe('管理员-邀请管理', () => {
  it('POST /admin/tenders 时不传 invitedSupplierIds = 不邀请任何人', async () => {
    const { app, token } = await admin();
    await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const res = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({ title: 'T', deadline: new Date(Date.now() + 86400_000).toISOString() });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/admin/tenders/${res.body.tender.id}`).set(auth(token));
    expect(detail.body.tender.invitedSupplierIds).toEqual([]);
  });

  it('POST /admin/tenders 传 invitedSupplierIds 仅保留真供应商', async () => {
    const { app, token } = await admin();
    const sup = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const res = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [sup.user.id, '00000000-0000-0000-0000-000000000000'],
      });
    expect(res.status).toBe(201);
    const detail = await request(app).get(`/api/admin/tenders/${res.body.tender.id}`).set(auth(token));
    expect(detail.body.tender.invitedSupplierIds).toEqual([sup.user.id]);
  });

  it('PATCH /admin/tenders/:id 替换邀请名单', async () => {
    const { app, token } = await admin();
    const supA = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const supB = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supA.user.id],
      });
    const tid = create.body.tender.id;
    const patch = await request(app)
      .patch(`/api/admin/tenders/${tid}`)
      .set(auth(token))
      .send({ invitedSupplierIds: [supB.user.id] });
    expect(patch.status).toBe(200);
    const detail = await request(app).get(`/api/admin/tenders/${tid}`).set(auth(token));
    expect(detail.body.tender.invitedSupplierIds).toEqual([supB.user.id]);
  });

  it('POST /admin/tenders/:id/invitations 单条增补', async () => {
    const { app, token } = await admin();
    const supA = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const supB = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supA.user.id],
      });
    const tid = create.body.tender.id;
    const add = await request(app)
      .post(`/api/admin/tenders/${tid}/invitations`)
      .set(auth(token))
      .send({ supplierId: supB.user.id });
    expect(add.status).toBe(201);
    const detail = await request(app).get(`/api/admin/tenders/${tid}`).set(auth(token));
    expect(detail.body.tender.invitedSupplierIds.sort()).toEqual([supA.user.id, supB.user.id].sort());
  });

  it('POST /admin/tenders/:id/invitations 对非供应商返回 422', async () => {
    const { app, token } = await admin();
    const boss2 = await insertUser(testDb, { username: 'boss2', role: 'admin' });
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({ title: 'T', deadline: new Date(Date.now() + 86400_000).toISOString() });
    const tid = create.body.tender.id;
    const add = await request(app)
      .post(`/api/admin/tenders/${tid}/invitations`)
      .set(auth(token))
      .send({ supplierId: boss2.user.id });
    expect(add.status).toBe(422);
  });

  it('DELETE /admin/tenders/:id/invitations/:supplierId 取消单个邀请', async () => {
    const { app, token } = await admin();
    const supA = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supA.user.id],
      });
    const tid = create.body.tender.id;
    const del = await request(app)
      .delete(`/api/admin/tenders/${tid}/invitations/${supA.user.id}`)
      .set(auth(token));
    expect(del.status).toBe(204);
    const detail = await request(app).get(`/api/admin/tenders/${tid}`).set(auth(token));
    expect(detail.body.tender.invitedSupplierIds).toEqual([]);
  });

  it('已关闭的招标仍可管理名单（绕过 close 守卫）', async () => {
    const { app, token } = await admin();
    const supA = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const supB = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const create = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({
        title: 'T',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
        invitedSupplierIds: [supA.user.id],
      });
    const tid = create.body.tender.id;
    await request(app).post(`/api/admin/tenders/${tid}/close`).set(auth(token));
    const add = await request(app)
      .post(`/api/admin/tenders/${tid}/invitations`)
      .set(auth(token))
      .send({ supplierId: supB.user.id });
    expect(add.status).toBe(201);
  });
});
