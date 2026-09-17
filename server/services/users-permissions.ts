import { and, eq, or, sql } from 'drizzle-orm';
import { users as usersTable } from '../db/schema';
import type { Db } from '../db/client';
import type { Role } from '../auth/jwt';

/**
 * procurement 创建用户：允许 supplier / procurement；禁止 admin。
 */
export function canCreateRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'admin') return true;
  if (actorRole === 'procurement') {
    return targetRole === 'supplier' || targetRole === 'procurement';
  }
  return false;
}

/**
 * procurement 可以修改 supplier 账号（且必须是自己创建的）。
 * admin 可以修改任何账号。
 */
export function canModifyUser(
  actorRole: Role,
  targetRole: Role,
  targetCreatedBy: string | null,
  actorId: string,
): boolean {
  if (actorRole === 'admin') return true;
  if (actorRole === 'procurement') {
    return targetRole === 'supplier' && targetCreatedBy === actorId;
  }
  return false;
}

/**
 * 任何人都不能修改自己的 role（防降权）。
 */
export function canChangeRole(
  actorRole: Role,
  actorId: string,
  targetUserId: string,
): boolean {
  // 改别人：始终允许（前提是 canModifyUser 通过）
  if (actorId !== targetUserId) return true;
  // 改自己：禁止
  return false;
}

/**
 * 列出可见账号。admin 看全部；procurement 看 supplier 全部 + 自己创建的任意角色。
 */
export async function listVisibleUserIds(db: Db, actor: { id: string; role: Role }): Promise<string[]> {
  if (actor.role === 'admin') {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable);
    return rows.map((r) => r.id);
  }
  if (actor.role === 'procurement') {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.role, 'supplier'),
          eq(usersTable.createdBy, actor.id),
        ),
      );
    return rows.map((r) => r.id);
  }
  return [];
}
