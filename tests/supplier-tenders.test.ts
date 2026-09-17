import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, inviteSupplierToAllTenders, loginToken, auth } from './helpers';
import { tenders, quotes, users } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const boss = (await testDb.select().from(users)).find(
    (u: { username: string }) => u.username === 'boss',
  )!;
  const sup = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
  const token = await loginToken(app, 'sup1', 'Passw0rd!123');
  return { app, bossId: boss.id, supId: sup.user.id, token };
}

describe('供应商-招标列表与详情', () => {
  it('列表返回开放与已截止的招标（含状态与我的报价摘要），不含他人信息', async () => {
    const { app, bossId, supId, token } = await setup();
    const other = await insertUser(testDb, { username: 'sup2', companyName: '乙公司' });
    const [open] = await testDb
      .insert(tenders)
      .values({ title: '开放招标', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
await inviteSupplierToAllTenders(testDb, supId);
    const [past] = await testDb
      .insert(tenders)
      .values({ title: '已截止', deadline: new Date(Date.now() - 1000), createdBy: bossId })
      .returning();
await inviteSupplierToAllTenders(testDb, supId);
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      {
        tenderId: open.id,
        supplierId: other.user.id,
        amount: '50.00',
        createdAt: t0,
        updatedAt: t0,
      },
      {
        tenderId: open.id,
        supplierId: supId,
        amount: '80.00',
        createdAt: new Date(t0.getTime() + 5000),
        updatedAt: new Date(t0.getTime() + 5000),
      },
    ]);
    const res = await request(app).get('/api/tenders').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.tenders).toHaveLength(2);
    const openRow = res.body.tenders.find((t: { id: string }) => t.id === open.id);
    expect(openRow).toMatchObject({
      title: '开放招标',
      myAmount: '80.00',
      myRank: 2,
      totalParticipants: 2,
      hasQuote: true,
    });
    const pastRow = res.body.tenders.find((t: { id: string }) => t.id === past.id);
    expect(pastRow.effectiveClosed).toBe(true);
    expect(pastRow.hasQuote).toBe(false);
  });

  it('详情返回招标信息 + 我的报价 + 我的名次，绝不返回他人报价', async () => {
    const { app, bossId, supId, token } = await setup();
    const other = await insertUser(testDb, { username: 'sup2', companyName: '乙公司' });
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
await inviteSupplierToAllTenders(testDb, supId);
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      {
        tenderId: t1.id,
        supplierId: other.user.id,
        amount: '50.00',
        createdAt: t0,
        updatedAt: t0,
      },
      {
        tenderId: t1.id,
        supplierId: supId,
        amount: '80.00',
        createdAt: new Date(t0.getTime() + 5000),
        updatedAt: new Date(t0.getTime() + 5000),
      },
    ]);
    const res = await request(app).get(`/api/tenders/${t1.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.tender.title).toBe('T1');
    expect(res.body.myQuote).toMatchObject({ amount: '80.00', rank: 2 });
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('50.00');
    expect(body).not.toContain('乙公司');
  });

  it('未报价时 myQuote 为 null', async () => {
    const { app, bossId, supId, token } = await setup();
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
await inviteSupplierToAllTenders(testDb, supId);
    const res = await request(app).get(`/api/tenders/${t1.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.myQuote).toBeNull();
    expect(res.body.totalParticipants).toBe(0);
  });

  it('不存在的招标返回 404', async () => {
    const { app, token } = await setup();
    const res = await request(app)
      .get('/api/tenders/00000000-0000-0000-0000-000000000000')
      .set(auth(token));
    expect(res.status).toBe(404);
  });
});
