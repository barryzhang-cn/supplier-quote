import { eq } from 'drizzle-orm';
import { tenders } from '../db/schema';
import type { Db } from '../db/client';
import type { Role } from '../auth/jwt';

/**
 * 判 `me` 是否能访问/操作 `tenderId`：
 * - admin 全部可访问
 * - procurement 仅自己创建的
 * - supplier 一律 false（不应走此函数；供应商用邀请隔离）
 */
export async function isOwnTender(
  db: Db,
  tenderId: string,
  userId: string,
  role: Role,
): Promise<boolean> {
  if (role === 'supplier') return false;
  const [t] = await db
    .select({ id: tenders.id, createdBy: tenders.createdBy })
    .from(tenders)
    .where(eq(tenders.id, tenderId));
  if (!t) return false;
  if (role === 'admin') return true;
  return t.createdBy === userId;
}

/**
 * 断言并抛 404（非 403，与供应商邀请隔离语义一致："不该看到的资源就不存在"）。
 */
export async function assertOwnTender(
  db: Db,
  tenderId: string,
  userId: string,
  role: Role,
): Promise<void> {
  const ok = await isOwnTender(db, tenderId, userId, role);
  if (!ok) {
    throw Object.assign(new Error('招标不存在'), { statusCode: 404 });
  }
}
