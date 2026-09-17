import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
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
  const [open] = await testDb
    .insert(tenders)
    .values({ title: '开放', deadline: new Date(Date.now() + 86400_000), createdBy: boss.id })
    .returning();
  await inviteSupplierToAllTenders(testDb, sup.user.id);
  const [closed] = await testDb
    .insert(tenders)
    .values({
      title: '已关闭',
      status: 'closed',
      deadline: new Date(Date.now() + 86400_000),
      createdBy: boss.id,
    })
    .returning();
await inviteSupplierToAllTenders(testDb, sup.user.id);
  const [past] = await testDb
    .insert(tenders)
    .values({ title: '已过期', deadline: new Date(Date.now() - 1000), createdBy: boss.id })
    .returning();
await inviteSupplierToAllTenders(testDb, sup.user.id);
  await inviteSupplierToAllTenders(testDb, sup.user.id);
  return { app, bossId: boss.id, supId: sup.user.id, token, open, closed, past };
}

describe('报价 upsert 与截止锁定', () => {
  it('首次提交成功，金额两位小数', async () => {
    const { app, open, supId, token } = await setup();
    const res = await request(app)
      .put(`/api/tenders/${open.id}/quote`)
      .set(auth(token))
      .send({ amount: '1234.50', note: '含运费' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(true);
  });

  it('非法金额返回 422（负数、三位小数、非数字）', async () => {
    const { app, open, supId, token } = await setup();
    for (const amount of ['-1', '1.234', 'abc', '']) {
      const res = await request(app)
        .put(`/api/tenders/${open.id}/quote`)
        .set(auth(token))
        .send({ amount });
      expect(res.status).toBe(422);
    }
  });

  it('重复提交为原地更新（一条记录），created_at 不变', async () => {
    const { app, supId, open, token } = await setup();
    await request(app).put(`/api/tenders/${open.id}/quote`).set(auth(token)).send({ amount: '100.00' });
    const [first] = await testDb.select().from(quotes).where(eq(quotes.tenderId, open.id));
    expect(first.createdAt.getTime()).toBeGreaterThan(0);
    const res = await request(app)
      .put(`/api/tenders/${open.id}/quote`)
      .set(auth(token))
      .send({ amount: '90.00', note: '改价' });
    expect(res.status).toBe(200);
    expect(res.body.created).toBe(false);
    const all = await testDb.select().from(quotes).where(eq(quotes.tenderId, open.id));
    expect(all).toHaveLength(1);
    expect(all[0].amount).toBe('90.00');
    expect(all[0].createdAt.getTime()).toBe(first.createdAt.getTime());
  });

  it('已关闭的招标返回 409', async () => {
    const { app, closed, supId, token } = await setup();
    const res = await request(app)
      .put(`/api/tenders/${closed.id}/quote`)
      .set(auth(token))
      .send({ amount: '100.00' });
    expect(res.status).toBe(409);
  });

  it('已过截止时间的招标返回 409（以服务器时间为准）', async () => {
    const { app, past, supId, token } = await setup();
    const res = await request(app)
      .put(`/api/tenders/${past.id}/quote`)
      .set(auth(token))
      .send({ amount: '100.00' });
    expect(res.status).toBe(409);
  });

  it('截止后 GET 自己的报价仍可见（只读）', async () => {
    const { app, supId, past, token } = await setup();
    const t0 = new Date('2026-09-17T08:00:00Z');
    await testDb.insert(quotes).values({
      tenderId: past.id,
      supplierId: supId,
      amount: '88.00',
      createdAt: t0,
      updatedAt: t0,
    });
    const res = await request(app).get(`/api/tenders/${past.id}/quote`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.quote.amount).toBe('88.00');
  });
});
