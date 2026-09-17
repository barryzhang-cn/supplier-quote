import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, quotes, users } from '../server/db/schema';

async function setupAdmin(app: ReturnType<typeof createApp>) {
  await insertUser(testDb, { username: 'boss', role: 'admin' });
  const token = await loginToken(app, 'boss', 'Passw0rd!123');
  const boss = (await testDb.select().from(users)).find(
    (u: { username: string }) => u.username === 'boss',
  )!;
  return { token, bossId: boss.id };
}

describe('管理员-招标管理', () => {
  it('新建招标成功，截止时间必须在未来', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const ok = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({
        title: '打印机采购',
        description: 'A4 激光打印机 5 台',
        deadline: new Date(Date.now() + 86400_000).toISOString(),
      });
    expect(ok.status).toBe(201);
    expect(ok.body.tender.status).toBe('open');

    const past = await request(app)
      .post('/api/admin/tenders')
      .set(auth(token))
      .send({ title: '过期招标', deadline: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(422);
  });

  it('列表带报价数统计', async () => {
    const app = createApp(testDb);
    const { token, bossId } = await setupAdmin(app);
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
    const sup = await insertUser(testDb, { username: 'sup1', companyName: '甲公司' });
    await testDb.insert(quotes).values({ tenderId: t1.id, supplierId: sup.user.id, amount: '100.00' });
    const res = await request(app).get('/api/admin/tenders').set(auth(token));
    expect(res.status).toBe(200);
    const row = res.body.tenders.find((t: { id: string }) => t.id === t1.id);
    expect(row.quoteCount).toBe(1);
  });

  it('详情返回完整报价榜（名次+公司名）', async () => {
    const app = createApp(testDb);
    const { token, bossId } = await setupAdmin(app);
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
    const a = await insertUser(testDb, { username: 'sup_a', companyName: '甲公司' });
    const b = await insertUser(testDb, { username: 'sup_b', companyName: '乙公司' });
    const t0 = new Date('2026-09-17T08:00:00Z');
    // 同价 100.00：b 首提更早 → b 第 1
    await testDb.insert(quotes).values([
      { tenderId: t1.id, supplierId: b.user.id, amount: '100.00', createdAt: t0, updatedAt: t0 },
      {
        tenderId: t1.id,
        supplierId: a.user.id,
        amount: '100.00',
        createdAt: new Date(t0.getTime() + 1000),
        updatedAt: new Date(t0.getTime() + 1000),
      },
    ]);
    const res = await request(app).get(`/api/admin/tenders/${t1.id}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.quotes).toHaveLength(2);
    expect(res.body.quotes[0]).toMatchObject({ companyName: '乙公司', rank: 1, amount: '100.00' });
    expect(res.body.quotes[1]).toMatchObject({ companyName: '甲公司', rank: 2 });
  });

  it('开放中可编辑；已截止后编辑返回 409', async () => {
    const app = createApp(testDb);
    const { token, bossId } = await setupAdmin(app);
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
    const edit = await request(app)
      .patch(`/api/admin/tenders/${t1.id}`)
      .set(auth(token))
      .send({ title: 'T1改' });
    expect(edit.status).toBe(200);
    expect(edit.body.tender.title).toBe('T1改');

    const [t2] = await testDb
      .insert(tenders)
      .values({ title: 'T2', deadline: new Date(Date.now() - 1000), createdBy: bossId })
      .returning();
    const editPast = await request(app)
      .patch(`/api/admin/tenders/${t2.id}`)
      .set(auth(token))
      .send({ title: 'x' });
    expect(editPast.status).toBe(409);
  });

  it('提前关闭后状态为 closed，重复关闭 409', async () => {
    const app = createApp(testDb);
    const { token, bossId } = await setupAdmin(app);
    const [t1] = await testDb
      .insert(tenders)
      .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: bossId })
      .returning();
    const close = await request(app).post(`/api/admin/tenders/${t1.id}/close`).set(auth(token));
    expect(close.status).toBe(200);
    expect(close.body.tender.status).toBe('closed');
    const again = await request(app).post(`/api/admin/tenders/${t1.id}/close`).set(auth(token));
    expect(again.status).toBe(409);
  });

  it('不存在的招标返回 404', async () => {
    const app = createApp(testDb);
    const { token } = await setupAdmin(app);
    const res = await request(app)
      .get('/api/admin/tenders/00000000-0000-0000-0000-000000000000')
      .set(auth(token));
    expect(res.status).toBe(404);
  });
});
