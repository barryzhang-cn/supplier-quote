import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, quotes, users } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const boss = (await testDb.select().from(users)).find(
    (u: { username: string }) => u.username === 'boss',
  )!;
  const [t1] = await testDb
    .insert(tenders)
    .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
    .returning();
  return { app, bossId: boss.id, t1 };
}

async function loginAs(app: ReturnType<typeof createApp>, username: string) {
  return loginToken(app, username, 'Passw0rd!123');
}

describe('名次规则', () => {
  it('金额低者名次靠前；同价先提交者靠前', async () => {
    const { app, t1 } = await setup();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const b = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const c = await insertUser(testDb, { username: 'sup_c', companyName: '丙' });
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      {
        tenderId: t1.id,
        supplierId: b.user.id,
        amount: '100.00',
        createdAt: t0,
        updatedAt: t0,
      },
      {
        tenderId: t1.id,
        supplierId: c.user.id,
        amount: '100.00',
        createdAt: new Date(t0.getTime() + 3600_000),
        updatedAt: new Date(t0.getTime() + 3600_000),
      },
      {
        tenderId: t1.id,
        supplierId: a.user.id,
        amount: '80.00',
        createdAt: new Date(t0.getTime() + 7200_000),
        updatedAt: new Date(t0.getTime() + 7200_000),
      },
    ]);
    const tokenA = await loginAs(app, 'sup_a');
    const resA = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenA));
    expect(resA.status).toBe(200);
    expect(resA.body).toEqual({ rank: 1, total: 3 });
    const tokenB = await loginAs(app, 'sup_b');
    const resB = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenB));
    expect(resB.body).toEqual({ rank: 2, total: 3 });
  });

  it('修改报价不改名次依据（首提时间早者仍领先）', async () => {
    const { app, t1 } = await setup();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const b = await insertUser(testDb, { username: 'sup_b', companyName: '乙' });
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values([
      {
        tenderId: t1.id,
        supplierId: a.user.id,
        amount: '100.00',
        createdAt: t0,
        updatedAt: t0,
      },
      {
        tenderId: t1.id,
        supplierId: b.user.id,
        amount: '100.00',
        createdAt: new Date(t0.getTime() + 1000),
        updatedAt: new Date(t0.getTime() + 1000),
      },
    ]);
    const tokenB = await loginAs(app, 'sup_b');
    await request(app).put(`/api/tenders/${t1.id}/quote`).set(auth(tokenB)).send({ amount: '100.00' });
    const res = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenB));
    expect(res.body).toEqual({ rank: 2, total: 2 });
  });

  it('未报价时 rank 为 null', async () => {
    const { app, t1 } = await setup();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    const aUser = (await testDb.select().from(users)).find((u: { username: string }) => u.username === 'sup_a')!;
    await testDb.insert(quotes).values({ tenderId: t1.id, supplierId: aUser.id, amount: '100.00' });
    await insertUser(testDb, { username: 'sup_x', companyName: '外部' });
    const tokenX = await loginAs(app, 'sup_x');
    const res = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenX));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ rank: null, total: 1 });
  });

  it('响应只含 rank 和 total，不泄露任何金额/公司名', async () => {
    const { app, t1 } = await setup();
    const aUser = (await testDb.select().from(users))[0]!; // boss
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲' });
    await testDb.insert(quotes).values({ tenderId: t1.id, supplierId: a.user.id, amount: '777.77' });
    await insertUser(testDb, { username: 'sup_x', companyName: '外部' });
    const tokenX = await loginAs(app, 'sup_x');
    const res = await request(app).get(`/api/tenders/${t1.id}/ranking`).set(auth(tokenX));
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('777.77');
    expect(body).not.toContain('甲');
    expect(Object.keys(res.body).sort()).toEqual(['rank', 'total']);
  });
});
