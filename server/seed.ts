import { eq } from 'drizzle-orm';
import { users } from './db/schema';
import { hashPassword } from './auth/password';
import type { Db } from './db/client';

export async function seedAdmin(db: Db) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'admin'))
    .limit(1);
  if (existing) return;
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password || password.length < 8) {
    throw new Error('首次启动需要 ADMIN_PASSWORD（至少 8 位）以创建初始管理员');
  }
  await db.insert(users).values({ username, passwordHash: hashPassword(password), role: 'admin' });
  console.log(`已创建初始管理员: ${username}`);
}
