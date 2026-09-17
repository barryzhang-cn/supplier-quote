import { Router } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenders, quotes, tenderInvitations } from '../db/schema';
import { currentUser } from '../auth/middleware';
import { computeRanks } from '../services/ranking';
import { upsertQuote } from '../services/quotes';
import { isInvited } from '../services/invitations';
import type { Db } from '../db/client';

const quoteBodySchema = z.object({
  amount: z
    .string()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, '金额必须是非负数字，最多两位小数'),
  note: z.string().max(2000).nullish(),
});

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
      .innerJoin(
        tenderInvitations,
        and(
          eq(tenderInvitations.tenderId, tenders.id),
          eq(tenderInvitations.supplierId, me.id),
        ),
      )
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
    const [t] = await db
      .select()
      .from(tenders)
      .innerJoin(
        tenderInvitations,
        and(
          eq(tenderInvitations.tenderId, tenders.id),
          eq(tenderInvitations.supplierId, me.id),
        ),
      )
      .where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    const tender = t.tenders;
    const [myQuote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.tenderId, tender.id), eq(quotes.supplierId, me.id)));
    const peers = await db
      .select({ supplierId: quotes.supplierId, amount: quotes.amount, createdAt: quotes.createdAt })
      .from(quotes)
      .where(eq(quotes.tenderId, tender.id));
    const ranks = computeRanks(peers);
    res.json({
      tender: tender,
      myQuote: myQuote ? { ...myQuote, rank: ranks.get(me.id) ?? null } : null,
      totalParticipants: peers.length,
      effectiveClosed: tender.status === 'closed' || tender.deadline.getTime() <= Date.now(),
    });
  });

  r.get('/tenders/:id/quote', async (req, res) => {
    const me = currentUser(req);
    if (!(await isInvited(db, req.params.id, me.id))) {
      return res.status(404).json({ error: '招标不存在' });
    }
    const [q] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.tenderId, req.params.id), eq(quotes.supplierId, me.id)));
    res.json({ quote: q ?? null });
  });

  r.put('/tenders/:id/quote', async (req, res) => {
    const me = currentUser(req);
    if (!(await isInvited(db, req.params.id, me.id))) {
      return res.status(403).json({ error: '您未受邀参与此招标' });
    }
    const parsed = quoteBodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: parsed.error.issues[0].message });
    const result = await upsertQuote(db, req.params.id, me.id, parsed.data.amount, parsed.data.note ?? null);
    if (!result.ok) return res.status(result.code).json({ error: result.error });
    return res.json({ created: result.created });
  });

  r.get('/tenders/:id/ranking', async (req, res) => {
    const me = currentUser(req);
    const [t] = await db
      .select({ id: tenders.id })
      .from(tenders)
      .innerJoin(
        tenderInvitations,
        and(
          eq(tenderInvitations.tenderId, tenders.id),
          eq(tenderInvitations.supplierId, me.id),
        ),
      )
      .where(eq(tenders.id, req.params.id));
    if (!t) return res.status(404).json({ error: '招标不存在' });
    const peers = await db
      .select({ supplierId: quotes.supplierId, amount: quotes.amount, createdAt: quotes.createdAt })
      .from(quotes)
      .where(eq(quotes.tenderId, t.tenders.id));
    const ranks = computeRanks(peers);
    const myRank = ranks.get(me.id) ?? null;
    return res.json({ rank: myRank, total: peers.length });
  });

  return r;
}
