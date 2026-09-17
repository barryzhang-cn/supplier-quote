import { and, eq } from 'drizzle-orm';
import { tenders, quotes } from '../db/schema';
import type { Db } from '../db/client';

export type UpsertResult =
  | { ok: true; created: boolean }
  | { ok: false; code: 404 | 409; error: string };

/**
 * 截止锁定核心：事务内 SELECT ... FOR UPDATE 锁定招标行，
 * 以数据库当前时间判断截止，再 upsert 报价。
 * created_at 仅在首次插入时生成（名次平局判定依据），更新时永不修改。
 */
export async function upsertQuote(
  db: Db,
  tenderId: string,
  supplierId: string,
  amount: string,
  note: string | null,
): Promise<UpsertResult> {
  return db.transaction(async (tx) => {
    const [tender] = await tx
      .select({ id: tenders.id, status: tenders.status, deadline: tenders.deadline })
      .from(tenders)
      .where(eq(tenders.id, tenderId))
      .for('update');
    if (!tender) return { ok: false, code: 404, error: '招标不存在' };
    if (tender.status === 'closed' || tender.deadline.getTime() <= Date.now()) {
      return { ok: false, code: 409, error: '报价已截止，无法修改' };
    }
    const [existing] = await tx
      .select({ id: quotes.id })
      .from(quotes)
      .where(and(eq(quotes.tenderId, tenderId), eq(quotes.supplierId, supplierId)));
    const now = new Date();
    if (existing) {
      await tx
        .update(quotes)
        .set({ amount, note, updatedAt: now })
        .where(eq(quotes.id, existing.id));
      return { ok: true, created: false };
    }
    await tx.insert(quotes).values({ tenderId, supplierId, amount, note });
    return { ok: true, created: true };
  });
}
