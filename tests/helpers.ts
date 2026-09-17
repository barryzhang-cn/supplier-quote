import request from 'supertest';
import type { Express } from 'express';
import { eq, and } from 'drizzle-orm';
import { users, tenders, tenderInvitations } from '../server/db/schema';
import { hashPassword } from '../server/auth/password';
import type { Db } from '../server/db/client';

export async function insertUser(
  db: Db,
  opts: {
    username: string;
    role?: 'admin' | 'supplier';
    companyName?: string | null;
    active?: boolean;
    password?: string;
  },
) {
  const password = opts.password ?? 'Passw0rd!123';
  const [u] = await db
    .insert(users)
    .values({
      username: opts.username,
      passwordHash: hashPassword(password),
      role: opts.role ?? 'supplier',
      companyName: opts.companyName ?? null,
      active: opts.active ?? true,
    })
    .returning();
  // 自动邀请：任何新启用的 supplier 对当前所有开放中/已截止的 tender 都加入邀请（与现状一致）
  if (u.role === 'supplier' && u.active) {
    const allTenders = await db.select({ id: tenders.id }).from(tenders);
    for (const t of allTenders) {
      await db
        .insert(tenderInvitations)
        .values({ tenderId: t.id, supplierId: u.id })
        .onConflictDoNothing();
    }
  }
  return { user: u, password };
}

export async function loginToken(app: Express, username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/auth/login').send({ username, password });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token as string;
}

export function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * 一次性把指定 supplier 邀请到指定 tender（若 supplier 已是 active=true）
 */
export async function inviteSupplier(db: Db, tenderId: string, supplierId: string) {
  await db
    .insert(tenderInvitations)
    .values({ tenderId, supplierId })
    .onConflictDoNothing();
}

/**
 * 一次性把指定 supplier 邀请到当前所有 tender
 */
export async function inviteSupplierToAllTenders(db: Db, supplierId: string) {
  const all = await db.select({ id: tenders.id }).from(tenders);
  for (const t of all) {
    await db
      .insert(tenderInvitations)
      .values({ tenderId: t.id, supplierId })
      .onConflictDoNothing();
  }
}

/**
 * 直接建一个 tender 并邀请所有 active supplier（测试场景专用）
 */
export async function insertTenderForAllSuppliers(
  db: Db,
  opts: { title?: string; deadline: Date; status?: 'open' | 'closed'; createdBy?: string },
) {
  let boss: { id: string } | undefined;
  if (opts.createdBy) {
    boss = { id: opts.createdBy };
  } else {
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
    boss = u;
  }
  if (!boss) throw new Error('insertTenderForAllSuppliers needs an admin');
  const [t] = await db
    .insert(tenders)
    .values({
      title: opts.title ?? 'T',
      deadline: opts.deadline,
      status: opts.status ?? 'open',
      createdBy: boss.id,
    })
    .returning();
  // 邀请所有 active supplier
  const allSuppliers = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, 'supplier'), eq(users.active, true)));
  if (allSuppliers.length > 0) {
    await db
      .insert(tenderInvitations)
      .values(allSuppliers.map((s) => ({ tenderId: t.id, supplierId: s.id })));
  }
  return t;
}
