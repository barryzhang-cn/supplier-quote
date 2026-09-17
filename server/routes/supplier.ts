import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { tenders, quotes } from '../db/schema';
import { currentUser } from '../auth/middleware';
import { computeRanks } from '../services/ranking';
import type { Db } from '../db/client';

export function supplierRouter(db: Db) {
  const r = Router();

  r.get('/tenders', async (req, res) => {
    const me = currentUser(req);
    const rows = await db
      .select({
        id: tenders.id,
        title: tenders.title,
        description: tenders.description,
        deadline: tenders.deadline,
        status: tenders.status,
        createdAt: tenders.createdAt,
        myAmount: quotes.amount,
        myQuoteUpdatedAt: quotes.updatedAt,
      })
      .from(tenders)
      .leftJoin(quotes, and(eq(quotes.tenderId, tenders.id), eq(quotes.supplierId, me.id)))
      .orderBy(desc(tenders.createdAt));
    const allQuotes = await db
      .select({
        tenderId: quotes.tenderId,
        supplierId: quotes.supplierId,
        amount: quotes.amount,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .orderBy(quotes.amount, quotes.createdAt);
    const now = Date.now();
    const result = rows.map((t) => {
      const peers = allQuotes.filter((q) => q.tenderId === t.id);
      const ranks = computeRanks(peers);
      return {
        ...t,
        hasQuote: t.myAmount != null,
        effectiveClosed: t.status === 'closed' || t.deadline.getTime() <= now,
        myRank: t.myAmount != null ? ranks.get(me.id) ?? null : null,
        totalParticipants: peers.length,
      };
    });
    res.json({ tenders: result });
  });

  r.get('/tenders/:id', async (req, res) => {
    const me = currentUser(req);
    const [t] = await db.select().from(tenders).where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    const [myQuote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.tenderId, t.id), eq(quotes.supplierId, me.id)));
    const peers = await db
      .select({ supplierId: quotes.supplierId, amount: quotes.amount, createdAt: quotes.createdAt })
      .from(quotes)
      .where(eq(quotes.tenderId, t.id));
    const ranks = computeRanks(peers);
    res.json({
      tender: t,
      myQuote: myQuote ? { ...myQuote, rank: ranks.get(me.id) ?? null } : null,
      totalParticipants: peers.length,
      effectiveClosed: t.status === 'closed' || t.deadline.getTime() <= Date.now(),
    });
  });

  return r;
}
