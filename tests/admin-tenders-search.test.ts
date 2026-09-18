import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { createApp } from '../server/app';
import { testDb } from './setup';
import { insertUser, loginToken, auth } from './helpers';
import { tenders, users } from '../server/db/schema';

async function setup() {
  const app = createApp(testDb);
  const boss = await insertUser(testDb, { username: 'boss', role: 'admin' });
  const buyer = await insertUser(testDb, {
    username: 'buyer',
    role: 'procurement',
    createdBy: boss.user.id,
  });
  const bossTok = await loginToken(app, 'boss', 'Passw0rd!123');
  const buyerTok = await loginToken(app, 'buyer', 'Passw0rd!123');

  // 3 个未来招标（老板 / 采购员 / 老板）
  await request(app)
    .post('/api/admin/tenders')
    .set(auth(bossTok))
    .send({
      title: '打印机采购',
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
  await request(app)
    .post('/api/admin/tenders')
    .set(auth(buyerTok))
    .send({
      title: '办公用品采购',
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
  await request(app)
    .post('/api/admin/tenders')
    .set(auth(bossTok))
    .send({
      title: '服务器设备采购',
      deadline: new Date(Date.now() + 86400_000).toISOString(),
    });
  return { app, boss, buyer, bossTok, buyerTok };
}

describe('GET /admin/tenders 搜索 + 状态 + 创建者', () => {
  it('返回 createdByUsername 字段', async () => {
    const { app, bossTok, buyer } = await setup();
    const res = await request(app).get('/api/admin/tenders').set(auth(bossTok));
    expect(res.status).toBe(200);
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles).toEqual(expect.arrayContaining(['打印机采购', '办公用品采购', '服务器设备采购']));
    const office = res.body.tenders.find((t: { title: string }) => t.title === '办公用品采购');
    expect(office.createdByUsername).toBe('buyer');
    expect(office.createdBy).toBe(buyer.user.id);
  });

  it('q=办公 命中标题', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app)
      .get('/api/admin/tenders?q=' + encodeURIComponent('办公'))
      .set(auth(bossTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['办公用品采购']);
  });

  it('q=buyer 命中创建者', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app)
      .get('/api/admin/tenders?q=buyer')
      .set(auth(bossTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['办公用品采购']);
  });

  it('status=open 只返回报价中的招标', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app)
      .get('/api/admin/tenders?status=open')
      .set(auth(bossTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles.length).toBe(3); // 都是 open 且未截止
  });

  it('status=expired 只返回 status=open 但已过截止的招标', async () => {
    const { app, bossTok } = await setup();
    // 把其中一个手动置为已过期
    const all = await testDb.select().from(tenders);
    const first = all[0];
    await testDb
      .update(tenders)
      .set({ deadline: new Date(Date.now() - 86400_000) })
      .where(eq(tenders.id, first.id));

    const res = await request(app)
      .get('/api/admin/tenders?status=expired')
      .set(auth(bossTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles).toEqual([first.title]);
  });

  it('status=closed 只返回手动关闭的招标', async () => {
    const { app, bossTok } = await setup();
    const all = await testDb.select().from(tenders);
    await testDb
      .update(tenders)
      .set({ status: 'closed' })
      .where(eq(tenders.id, all[0].id));

    const res = await request(app)
      .get('/api/admin/tenders?status=closed')
      .set(auth(bossTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles).toEqual([all[0].title]);
  });

  it('procurement 视角仍受 createdBy 范围限制', async () => {
    const { app, buyerTok } = await setup();
    const res = await request(app).get('/api/admin/tenders').set(auth(buyerTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles).toEqual(['办公用品采购']); // 仅 buyer 创建的
  });

  it('q + status 组合筛选', async () => {
    const { app, bossTok } = await setup();
    const res = await request(app)
      .get('/api/admin/tenders?q=采购&status=open')
      .set(auth(bossTok));
    const titles = res.body.tenders.map((t: { title: string }) => t.title);
    expect(titles.length).toBe(3);
  });
});