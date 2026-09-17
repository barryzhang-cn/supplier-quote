import type { Request, Response, NextFunction } from 'express';
import { eq } from 'drizzle-orm';
import { users } from '../db/schema';
import { verifyToken } from './jwt';
import type { Db } from '../db/client';

export interface AuthedUser {
  id: string;
  username: string;
  role: 'admin' | 'supplier';
  companyName: string | null;
}

export interface AuthedRequest extends Request {
  user: AuthedUser;
}

export function currentUser(req: Request): AuthedUser {
  return (req as AuthedRequest).user;
}

export function requireAuth(db: Db) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: '未登录' });
    const payload = verifyToken(header.slice(7));
    if (!payload) return res.status(401).json({ error: '登录已过期，请重新登录' });
    const [u] = await db
      .select({
        id: users.id,
        username: users.username,
        role: users.role,
        companyName: users.companyName,
        active: users.active,
      })
      .from(users)
      .where(eq(users.id, payload.sub));
    if (!u) return res.status(401).json({ error: '账号不存在' });
    if (!u.active) return res.status(403).json({ error: '账号已停用' });
    (req as AuthedRequest).user = u;
    next();
  };
}

export function requireRole(role: 'admin' | 'supplier') {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as AuthedRequest).user;
    if (!user || user.role !== role) return res.status(403).json({ error: '无权限' });
    next();
  };
}