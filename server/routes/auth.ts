import { Router } from 'express';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { users } from '../db/schema';
import { verifyPassword } from '../auth/password';
import { signToken } from '../auth/jwt';
import { requireAuth, currentUser } from '../auth/middleware';
import type { Db } from '../db/client';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export function authRouter(db: Db) {
  const r = Router();

  r.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: '请输入用户名和密码' });
    const { username, password } = parsed.data;
    const [u] = await db.select().from(users).where(eq(users.username, username));
    if (!u || !verifyPassword(password, u.passwordHash)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    if (!u.active) return res.status(403).json({ error: '账号已停用，请联系管理员' });
    const token = signToken({ sub: u.id, role: u.role });
    return res.json({
      token,
      user: { id: u.id, username: u.username, role: u.role, companyName: u.companyName },
    });
  });

  r.get('/me', requireAuth(db), (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return r;
}
