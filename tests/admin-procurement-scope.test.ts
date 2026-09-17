import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  const boss = await insertUser(testDb, { username: 'boss', role: 'admin' });
  const buyer = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
  const bossTok = await loginToken(app, 'boss', 'Passw0rd!123');
  const buyerTok = await loginToken(app, 'buyer', 'Passw0rd!123');
  return { app, boss: boss.user, buyer: buyer.user, bossTok, buyerTok };
}

async function createTenderAs(token: string, app: ReturnType<typeof createApp>) {
  const res = await request(app)
    .post('/api/admin/tenders')
    .set(auth(token))
    .send({
      title: 'T',
      deadline: new Date(Date.now() + 86400_000).toISOString(),
      invitedSupplierIds: [],
    });
  if (!res.body.tender) throw new Error('no tender: ' + JSON.stringify(res.body));
  return res.body.tender.id as string;
}

describe('procurement 范围隔离', () => {
  it('admin 可看到全部招标列表', async () => {
    const { app, bossTok, buyerTok } = await setup();
    const tBoss = await createTenderAs(bossTok, app);
    const tBuyer = await createTenderAs(buyerTok, app);
    const res = await request(app).get('/api/admin/tenders').set(auth(bossTok));
    const ids = res.body.tenders.map((t: { id: string }) => t.id);
    expect(ids).toEqual(expect.arrayContaining([tBoss, tBuyer]));
  });

  it('procurement 列表仅自己创建的', async () => {
    const { app, bossTok, buyerTok } = await setup();
    const tBoss = await createTenderAs(bossTok, app);
    const tBuyer = await createTenderAs(buyerTok, app);
    const res = await request(app).get('/api/admin/tenders').set(auth(buyerTok));
    const ids = res.body.tenders.map((t: { id: string }) => t.id);
    expect(ids).toContain(tBuyer);
    expect(ids).not.toContain(tBoss);
  });

  it('procurement 创建招标自动 created_by = me', async () => {
    const { app, buyer, buyerTok } = await setup();
    const tid = await createTenderAs(buyerTok, app);
    const [t] = await testDb.select().from(tenders).where(eq(tenders.id, tid));
    expect(t.createdBy).toBe(buyer.id);
  });

  it('procurement 详情自己创建的 200，他人 404', async () => {
    const { app, bossTok, buyerTok } = await setup();
    const tBoss = await createTenderAs(bossTok, app);
    const tBuyer = await createTenderAs(buyerTok, app);
    const own = await request(app).get(`/api/admin/tenders/${tBuyer}`).set(auth(buyerTok));
    const other = await request(app).get(`/api/admin/tenders/${tBoss}`).set(auth(buyerTok));
    expect(own.status).toBe(200);
    expect(other.status).toBe(404);
  });

  it('procurement 编辑他人招标 404', async () => {
    const { app, bossTok, buyerTok } = await setup();
    const tBoss = await createTenderAs(bossTok, app);
    const res = await request(app)
      .patch(`/api/admin/tenders/${tBoss}`)
      .set(auth(buyerTok))
      .send({ title: '改' });
    expect(res.status).toBe(404);
  });

  it('procurement 编辑自己招标但禁止改 created_by', async () => {
    const { app, boss, buyerTok, bossTok } = await setup();
    const tBuyer = await createTenderAs(buyerTok, app);
    const res = await request(app)
      .patch(`/api/admin/tenders/${tBuyer}`)
      .set(auth(buyerTok))
      .send({ title: '新', createdBy: boss.id });
    expect(res.status).toBe(200);
    const detail = await request(app).get(`/api/admin/tenders/${tBuyer}`).set(auth(bossTok));
    expect(detail.body.tender.createdBy).not.toBe(boss.id);
  });

  it('procurement 可管理供应商账号（与 admin 等同）', async () => {
    const { app, buyerTok } = await setup();
    const res = await request(app)
      .post('/api/admin/users')
      .set(auth(buyerTok))
      .send({ username: 'new_sup', password: 'InitPass!234', companyName: '新供应商' });
    expect(res.status).toBe(201);
  });

  it('admin 可以修改 procurement 创建的招标的 created_by（重新指派）', async () => {
    const { app, boss, buyerTok, bossTok } = await setup();
    const tBuyer = await createTenderAs(buyerTok, app);
    const res = await request(app)
      .patch(`/api/admin/tenders/${tBuyer}`)
      .set(auth(bossTok))
      .send({ createdBy: boss.id });
    expect(res.status).toBe(200);
    const detail = await request(app).get(`/api/admin/tenders/${tBuyer}`).set(auth(bossTok));
    expect(detail.body.tender.createdBy).toBe(boss.id);
  });
});
