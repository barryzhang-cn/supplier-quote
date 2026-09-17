import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema';
import { hashPassword } from '../auth/password';
import type { Db } from '../db/client';

const createUserSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[\w.-]+$/, '用户名仅限字母、数字、._-'),
  password: z.string().min(8, '密码至少 8 位').max(72),
  companyName: z.string().min(1, '公司名称必填').max(100),
});

const patchUserSchema = z.object({
  password: z.string().min(8, '密码至少 8 位').max(72).optional(),
  active: z.boolean().optional(),
});

export function adminRouter(db: Db) {
  const r = Router();

  r.get('/users', async (_req, res) => {
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        companyName: users.companyName,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.role, 'supplier'))
      .orderBy(users.createdAt);
    res.json({ users: rows });
  });

  r.post('/users', async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const { username, password, companyName } = parsed.data;
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.username, username));
    if (dup) return res.status(409).json({ error: '用户名已存在' });
    const [u] = await db
      .insert(users)
      .values({
        username,
        passwordHash: hashPassword(password),
        role: 'supplier',
        companyName,
      })
      .returning({ id: users.id, username: users.username, companyName: users.companyName, role: users.role });
    return res.status(201).json({ user: u });
  });

  r.patch('/users/:id', async (req, res) => {
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const values: { passwordHash?: string; active?: boolean } = {};
    if (parsed.data.password) values.passwordHash = hashPassword(parsed.data.password);
    if (parsed.data.active !== undefined) values.active = parsed.data.active;
    if (Object.keys(values).length === 0) return res.status(422).json({ error: '无可更新字段' });
    const [u] = await db
      .update(users)
      .set(values)
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id, username: users.username, active: users.active });
    if (!u) return res.status(404).json({ error: '用户不存在' });
    return res.json({ user: u });
  });

  return r;
}
