import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { testDb, rawClient } from './setup';
import { tenders, users, tenderInvitations } from '../server/db/schema';
import {
  replaceInvitations,
  addInvitation,
  removeInvitation,
  isInvited,
  listInvitedSupplierIds,
} from '../server/services/invitations';

async function seed() {
  await rawClient`TRUNCATE tender_invitations, quotes, tenders, users CASCADE`;
  const [admin] = await testDb
    .insert(users)
    .values({ username: 'boss', passwordHash: 'x', role: 'admin' })
    .returning();
  const [supA] = await testDb
    .insert(users)
    .values({ username: 'a', passwordHash: 'x', role: 'supplier', companyName: '甲' })
    .returning();
  const [supB] = await testDb
    .insert(users)
    .values({ username: 'b', passwordHash: 'x', role: 'supplier', companyName: '乙' })
    .returning();
  const [tender] = await testDb
    .insert(tenders)
    .values({ title: 'T1', deadline: new Date(Date.now() + 86400_000), createdBy: admin.id })
    .returning();
  return { admin, supA, supB, tender };
}

describe('invitations service', () => {
  it('replaceInvitations 幂等替换（增删）', async () => {
    const { tender, supA, supB } = await seed();
    await replaceInvitations(testDb, tender.id, [supA.id]);
    expect(await listInvitedSupplierIds(testDb, tender.id)).toEqual([supA.id]);
    await replaceInvitations(testDb, tender.id, [supB.id]);
    expect(await listInvitedSupplierIds(testDb, tender.id)).toEqual([supB.id]);
  });

  it('replaceInvitations 传空数组 = 不邀请任何人', async () => {
    const { tender, supA } = await seed();
    await replaceInvitations(testDb, tender.id, [supA.id]);
    await replaceInvitations(testDb, tender.id, []);
    expect(await isInvited(testDb, tender.id, supA.id)).toBe(false);
  });

  it('replaceInvitations 跳过 admin 与不存在 id（仅保留真供应商）', async () => {
    const { tender, supA, admin } = await seed();
    await replaceInvitations(testDb, tender.id, [supA.id, admin.id, '00000000-0000-0000-0000-000000000000']);
    expect(await isInvited(testDb, tender.id, supA.id)).toBe(true);
    expect(await isInvited(testDb, tender.id, admin.id)).toBe(false);
  });

  it('addInvitation / removeInvitation 单条操作', async () => {
    const { tender, supA, supB } = await seed();
    await addInvitation(testDb, tender.id, supA.id);
    await addInvitation(testDb, tender.id, supB.id);
    expect(await listInvitedSupplierIds(testDb, tender.id)).toEqual(
      expect.arrayContaining([supA.id, supB.id]),
    );
    await removeInvitation(testDb, tender.id, supA.id);
    expect(await isInvited(testDb, tender.id, supA.id)).toBe(false);
    expect(await isInvited(testDb, tender.id, supB.id)).toBe(true);
  });

  it('addInvitation 重复添加不报错（UNIQUE 约束）', async () => {
    const { tender, supA } = await seed();
    await addInvitation(testDb, tender.id, supA.id);
    await addInvitation(testDb, tender.id, supA.id);
    const rows = await testDb
      .select()
      .from(tenderInvitations)
      .where(eq(tenderInvitations.tenderId, tender.id));
    expect(rows).toHaveLength(1);
  });

  it('addInvitation 对非供应商 / 不存在 id / 停用账号抛 422', async () => {
    const { tender, admin } = await seed();
    await expect(addInvitation(testDb, tender.id, admin.id)).rejects.toMatchObject({ code: 422 });
    await expect(
      addInvitation(testDb, tender.id, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toMatchObject({ code: 422 });
  });
});
