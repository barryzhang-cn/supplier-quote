import { and, eq, or, sql, type SQL } from 'drizzle-orm';
import { users as usersTable, quotes as quotesTable, tenders as tendersTable } from '../db/schema';
import type { Db } from '../db/client';
import type { Role } from '../auth/jwt';
import { systemAdminUsername } from '../env';

/**
 * 是否是系统内置管理员。
 * 该账号受保护：列表里看不到；任何 PATCH / DELETE 都被拒绝。
 */
export function isSystemAdmin(username: string): boolean {
  return username === systemAdminUsername();
}

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
 * procurement 可以修改 supplier 账号（且必须是自己创建的）；
 * 也可以修改自己创建的 procurement（同级之间明确责任归属）。
 * admin 可以修改任何非系统管理员账号。
 */
export function canModifyUser(
  actorRole: Role,
  targetRole: Role,
  targetCreatedBy: string | null,
  actorId: string,
): boolean {
  if (actorRole === 'admin') {
    // 留给路由层做系统管理员守卫；这里只放行普通账号
    return true;
  }
  if (actorRole === 'procurement') {
    if (targetRole === 'supplier') return targetCreatedBy === actorId;
    if (targetRole === 'procurement') return targetCreatedBy === actorId;
    return false;
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
 * 删除权限：
 * - admin：任何非系统管理员账号（系统管理员守卫在路由层）
 * - procurement：仅自己创建的 supplier / procurement
 * - supplier：不能删任何账号
 */
export function canDeleteUser(
  actorRole: Role,
  targetRole: Role,
  targetCreatedBy: string | null,
  actorId: string,
): boolean {
  if (actorRole === 'admin') return true;
  if (actorRole === 'procurement') {
    if (targetRole === 'supplier') return targetCreatedBy === actorId;
    if (targetRole === 'procurement') return targetCreatedBy === actorId;
    return false;
  }
  return false;
}

/**
 * 列出可见账号。
 * - admin：除系统管理员外的全部账号
 * - procurement：所有 supplier + 自己创建的非 supplier
 *
 * `q`：模糊匹配 username / companyName（大小写不敏感）
 */
export async function listVisibleUserIds(
  db: Db,
  actor: { id: string; role: Role },
  q?: string,
): Promise<string[]> {
  const conds: (SQL | undefined)[] = [
    sql`${usersTable.username} <> ${systemAdminUsername()}`,
  ];
  const term = q?.trim();
  if (term) {
    const like = `%${term.toLowerCase()}%`;
    conds.push(
      sql`(lower(${usersTable.username}) LIKE ${like} OR lower(coalesce(${usersTable.companyName}, '')) LIKE ${like})`,
    );
  }
  if (actor.role === 'admin') {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(...conds));
    return rows.map((r) => r.id);
  }
  if (actor.role === 'procurement') {
    const rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          ...conds,
          or(
            eq(usersTable.role, 'supplier'),
            eq(usersTable.createdBy, actor.id),
          ),
        ),
      );
    return rows.map((r) => r.id);
  }
  return [];
}

/**
 * 关联数据检查：返回该用户作为创建者创建了多少 tender / quote。
 * 删除前调用；非 0 时拒绝删除。
 */
export async function countUserFootprint(
  db: Db,
  userId: string,
): Promise<{ tenders: number; quotes: number }> {
  const [tRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(tendersTable)
    .where(eq(tendersTable.createdBy, userId));
  const [qRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(quotesTable)
    .where(eq(quotesTable.supplierId, userId));
  return { tenders: tRow?.c ?? 0, quotes: qRow?.c ?? 0 };
}