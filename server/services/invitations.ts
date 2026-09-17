import { eq, and, inArray } from 'drizzle-orm';
import { users, tenderInvitations } from '../db/schema';
import type { Db } from '../db/client';

/**
 * 幂等替换某招标的全部邀请：
 * - 清空现有邀请
 * - 插入新名单（仅 role=supplier 且 active=true 且真实存在的用户）
 * - 空数组 = 全部移除
 */
export async function replaceInvitations(db: Db, tenderId: string, supplierIds: string[]) {
  await db.transaction(async (tx) => {
    await tx.delete(tenderInvitations).where(eq(tenderInvitations.tenderId, tenderId));
    if (supplierIds.length === 0) return;
    const valid = await tx
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          inArray(users.id, supplierIds),
          eq(users.role, 'supplier'),
          eq(users.active, true),
        ),
      );
    if (valid.length === 0) return;
    await tx.insert(tenderInvitations).values(
      valid.map((v) => ({ tenderId, supplierId: v.id })),
    );
  });
}

export async function addInvitation(db: Db, tenderId: string, supplierId: string) {
  const [u] = await db
    .select({ id: users.id, role: users.role, active: users.active })
    .from(users)
    .where(eq(users.id, supplierId));
  if (!u || u.role !== 'supplier' || !u.active) {
    throw Object.assign(new Error('用户不是有效供应商'), { code: 422 });
  }
  await db
    .insert(tenderInvitations)
    .values({ tenderId, supplierId })
    .onConflictDoNothing();
}

export async function removeInvitation(db: Db, tenderId: string, supplierId: string) {
  await db
    .delete(tenderInvitations)
    .where(
      and(eq(tenderInvitations.tenderId, tenderId), eq(tenderInvitations.supplierId, supplierId)),
    );
}

export async function isInvited(db: Db, tenderId: string, supplierId: string): Promise<boolean> {
  const [row] = await db
    .select({ x: tenderInvitations.tenderId })
    .from(tenderInvitations)
    .where(
      and(eq(tenderInvitations.tenderId, tenderId), eq(tenderInvitations.supplierId, supplierId)),
    );
  return !!row;
}

export async function listInvitedSupplierIds(db: Db, tenderId: string): Promise<string[]> {
  const rows = await db
    .select({ id: tenderInvitations.supplierId })
    .from(tenderInvitations)
    .where(eq(tenderInvitations.tenderId, tenderId));
  return rows.map((r) => r.id);
}
