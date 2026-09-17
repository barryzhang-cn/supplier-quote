import { Router } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { users, tenders, quotes } from '../db/schema';
import { hashPassword } from '../auth/password';
import { currentUser } from '../auth/middleware';
import { computeRanks } from '../services/ranking';
import {
  addInvitation,
  listInvitedSupplierIds,
  removeInvitation,
  replaceInvitations,
} from '../services/invitations';
import { assertOwnTender } from '../services/admin-guard';
import {
  canChangeRole,
  canCreateRole,
  canModifyUser,
  listVisibleUserIds,
} from '../services/users-permissions';
import type { Db } from '../db/client';

const createUserSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[\w.-]+$/, '用户名仅限字母、数字、._-'),
  password: z.string().min(8, '密码至少 8 位').max(72),
  companyName: z.string().min(1, '公司名称必填').max(100).optional(),
  role: z.enum(['admin', 'procurement', 'supplier']).default('supplier'),
});

const patchUserSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(72).optional(),
  active: z.boolean().optional(),
  role: z.enum(['admin', 'procurement', 'supplier']).optional(),
});

const tenderBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(5000).nullish(),
  deadline: z.string().datetime({ offset: true }),
  invitedSupplierIds: z.array(z.string().uuid()).optional(),
  createdBy: z.string().uuid().optional(),
});

const addInvitationSchema = z.object({
  supplierId: z.string().uuid(),
});

export function adminRouter(db: Db) {
  const r = Router();
  const me = (req: import('express').Request) => currentUser(req);

  // -------- 账号管理（admin + procurement，但 procurement 受限） --------
  r.get('/users', async (req, res) => {
    const user = me(req);
    const ids = await listVisibleUserIds(db, { id: user.id, role: user.role });
    if (ids.length === 0) return res.json({ users: [] });
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        companyName: users.companyName,
        active: users.active,
        createdBy: users.createdBy,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(sql`${users.id} = ANY(${sql.raw(`ARRAY[${ids.map((i) => `'${i}'`).join(',')}]::uuid[]`)})`)
      .orderBy(users.createdAt);
    res.json({ users: rows });
  });

  r.post('/users', async (req, res) => {
    const actor = me(req);
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const { username, password, companyName, role } = parsed.data;
    if (!canCreateRole(actor.role, role)) {
      return res.status(403).json({ error: '您无权创建该角色的账号' });
    }
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (dup) return res.status(409).json({ error: '用户名已存在' });
    const [u] = await db
      .insert(users)
      .values({
        username,
        passwordHash: hashPassword(password),
        role,
        companyName: companyName ?? null,
        createdBy: actor.id,
      })
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        companyName: users.companyName,
        active: users.active,
      });
    return res.status(201).json({ user: u });
  });

  r.patch('/users/:id', async (req, res) => {
    const actor = me(req);
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });

    const [target] = await db
      .select({ id: users.id, role: users.role, createdBy: users.createdBy })
      .from(users)
      .where(eq(users.id, req.params.id));
    if (!target) return res.status(404).json({ error: '用户不存在' });

    if (!canModifyUser(actor.role, target.role, target.createdBy, actor.id)) {
      return res.status(403).json({ error: '您无权修改该账号' });
    }

    if (parsed.data.role !== undefined && !canChangeRole(actor.role, actor.id, target.id)) {
      return res.status(403).json({ error: '不能修改自己的角色' });
    }

    const values: { passwordHash?: string; active?: boolean; role?: 'admin' | 'procurement' | 'supplier' } = {};
    if (parsed.data.password) values.passwordHash = hashPassword(parsed.data.password);
    if (parsed.data.active !== undefined) values.active = parsed.data.active;
    if (parsed.data.role !== undefined) values.role = parsed.data.role;
    if (Object.keys(values).length === 0) return res.status(422).json({ error: '无可更新字段' });
    const [u] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, req.params.id))
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
        active: users.active,
      });
    return res.json({ user: u });
  });

  // -------- 招标管理 --------
  r.get('/tenders', async (req, res) => {
    const user = me(req);
    const baseSelect = db
      .select({
        id: tenders.id,
        title: tenders.title,
        description: tenders.description,
        deadline: tenders.deadline,
        status: tenders.status,
        createdBy: tenders.createdBy,
        createdAt: tenders.createdAt,
        quoteCount: sql<number>`count(${quotes.id})::int`,
      })
      .from(tenders)
      .leftJoin(quotes, eq(quotes.tenderId, tenders.id))
      .groupBy(tenders.id)
      .orderBy(desc(tenders.createdAt));
    const rows =
      user.role === 'procurement'
        ? await baseSelect.where(eq(tenders.createdBy, user.id))
        : await baseSelect;
    res.json({ tenders: rows });
  });

  r.post('/tenders', async (req, res) => {
    const parsed = tenderBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const user = me(req);
    const deadline = new Date(parsed.data.deadline);
    if (deadline.getTime() <= Date.now()) return res.status(422).json({ error: '截止时间必须晚于当前时间' });
    let createdBy = user.id;
    if (user.role === 'admin' && parsed.data.createdBy) createdBy = parsed.data.createdBy;
    const [t] = await db
      .insert(tenders)
      .values({
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        deadline,
        createdBy,
      })
      .returning();
    if (parsed.data.invitedSupplierIds !== undefined) {
      await replaceInvitations(db, t.id, parsed.data.invitedSupplierIds);
    }
    const invitedSupplierIds = await listInvitedSupplierIds(db, t.id);
    return res.status(201).json({ tender: { ...t, invitedSupplierIds } });
  });

  r.get('/tenders/:id', async (req, res) => {
    const user = me(req);
    try { await assertOwnTender(db, req.params.id, user.id, user.role); } catch { return res.status(404).json({ error: '招标不存在' }); }
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    const rows = await db
      .select({
        id: quotes.id,
        supplierId: quotes.supplierId,
        amount: quotes.amount,
        note: quotes.note,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
        companyName: users.companyName,
      })
      .from(quotes)
      .innerJoin(users, eq(users.id, quotes.supplierId))
      .where(eq(quotes.tenderId, t.id));
    const ranks = computeRanks(rows);
    const board = rows
      .map((q) => ({ ...q, rank: ranks.get(q.supplierId)! }))
      .sort((a, b) => a.rank - b.rank);
    const invitedSupplierIds = await listInvitedSupplierIds(db, t.id);
    return res.json({ tender: { ...t, invitedSupplierIds }, quotes: board });
  });

  r.patch('/tenders/:id', async (req, res) => {
    const user = me(req);
    try { await assertOwnTender(db, req.params.id, user.id, user.role); } catch { return res.status(404).json({ error: '招标不存在' }); }
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    const parsed = tenderBodySchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const editingLockRelevant =
      parsed.data.title !== undefined ||
      parsed.data.description !== undefined ||
      parsed.data.deadline !== undefined;
    if (editingLockRelevant && (t.status === 'closed' || t.deadline.getTime() <= Date.now())) {
      return res.status(409).json({ error: '招标已截止或已关闭，不可编辑' });
    }
    const values: { title?: string; description?: string | null; deadline?: Date; createdBy?: string } = {};
    if (parsed.data.title !== undefined) values.title = parsed.data.title;
    if (parsed.data.description !== undefined) values.description = parsed.data.description ?? null;
    if (parsed.data.deadline !== undefined) {
      const d = new Date(parsed.data.deadline);
      if (d.getTime() <= Date.now()) return res.status(422).json({ error: '截止时间必须晚于当前时间' });
      values.deadline = d;
    }
    if (user.role === 'admin' && parsed.data.createdBy !== undefined) {
      values.createdBy = parsed.data.createdBy;
    }
    if (Object.keys(values).length > 0) {
      await db.update(tenders).set(values).where(eq(tenders.id, t.id));
    }
    if (parsed.data.invitedSupplierIds !== undefined) {
      await replaceInvitations(db, t.id, parsed.data.invitedSupplierIds);
    }
    const [updated] = await db.select().from(tenders).where(eq(tenders.id, t.id));
    const invitedSupplierIds = await listInvitedSupplierIds(db, t.id);
    return res.json({ tender: { ...updated, invitedSupplierIds } });
  });

  r.post('/tenders/:id/close', async (req, res) => {
    const user = me(req);
    try { await assertOwnTender(db, req.params.id, user.id, user.role); } catch { return res.status(404).json({ error: '招标不存在' }); }
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    if (t.status === 'closed') return res.status(409).json({ error: '招标已关闭' });
    const [updated] = await db
      .update(tenders)
      .set({ status: 'closed' })
      .where(and(eq(tenders.id, t.id), eq(tenders.status, 'open')))
      .returning();
    const invitedSupplierIds = await listInvitedSupplierIds(db, t.id);
    return res.json({ tender: { ...updated, invitedSupplierIds } });
  });

  r.post('/tenders/:id/invitations', async (req, res) => {
    const user = me(req);
    try { await assertOwnTender(db, req.params.id, user.id, user.role); } catch { return res.status(404).json({ error: '招标不存在' }); }
    const [t] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(eq(tenders.id, req.params.id));
    const parsed = addInvitationSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    try {
      await addInvitation(db, t.id, parsed.data.supplierId);
    } catch (e) {
      if ((e as { code?: number }).code === 422) {
        return res.status(422).json({ error: (e as Error).message });
      }
      throw e;
    }
    const invitedSupplierIds = await listInvitedSupplierIds(db, t.id);
    return res.status(201).json({ invitedSupplierIds });
  });

  r.delete('/tenders/:id/invitations/:supplierId', async (req, res) => {
    const user = me(req);
    try { await assertOwnTender(db, req.params.id, user.id, user.role); } catch { return res.status(404).json({ error: '招标不存在' }); }
    const [t] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .where(eq(tenders.id, req.params.id));
    await removeInvitation(db, t.id, req.params.supplierId);
    return res.status(204).send();
  });

  return r;
}
