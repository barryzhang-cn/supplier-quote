import { describe, it, expect } from 'vitest';
import { testDb, rawClient } from './setup';
import { tenders } from '../server/db/schema';
import { insertUser } from './helpers';
import { isOwnTender, assertOwnTender } from '../server/services/admin-guard';

async function seed() {
  await rawClient`TRUNCATE tender_invitations, quotes, tenders, users CASCADE`;
  const admin = await insertUser(testDb, { username: 'boss', role: 'admin' });
  const proc = await insertUser(testDb, { username: 'buyer', role: 'procurement' });
  const t1 = await testDb
    .insert(tenders)
    .values({
      title: 'A',
      deadline: new Date(Date.now() + 86400_000),
      createdBy: admin.user.id,
    })
    .returning();
  const t2 = await testDb
    .insert(tenders)
    .values({
      title: 'B',
      deadline: new Date(Date.now() + 86400_000),
      createdBy: proc.user.id,
    })
    .returning();
  return { admin: admin.user, proc: proc.user, t1: t1[0], t2: t2[0] };
}

describe('admin guard', () => {
  it('isOwnTender: admin 看任意', async () => {
    const { admin, t1, t2 } = await seed();
    expect(await isOwnTender(testDb, t1.id, admin.id, admin.role)).toBe(true);
    expect(await isOwnTender(testDb, t2.id, admin.id, admin.role)).toBe(true);
  });

  it('isOwnTender: procurement 仅自己创建的', async () => {
    const { proc, t1, t2 } = await seed();
    expect(await isOwnTender(testDb, t1.id, proc.id, proc.role)).toBe(false);
    expect(await isOwnTender(testDb, t2.id, proc.id, proc.role)).toBe(true);
  });

  it('isOwnTender: 不存在的招标一律 false', async () => {
    const { admin } = await seed();
    expect(
      await isOwnTender(
        testDb,
        '00000000-0000-0000-0000-000000000000',
        admin.id,
        admin.role,
      ),
    ).toBe(false);
  });

  it('assertOwnTender: 非所有者抛 404', async () => {
    const { proc, t1 } = await seed();
    await expect(
      assertOwnTender(testDb, t1.id, proc.id, proc.role),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('assertOwnTender: 所有者直接 resolve', async () => {
    const { admin, t1 } = await seed();
    await expect(
      assertOwnTender(testDb, t1.id, admin.id, admin.role),
    ).resolves.toBeUndefined();
  });
});
