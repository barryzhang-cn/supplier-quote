export interface RankableQuote {
  supplierId: string;
  amount: string;
  createdAt: Date;
}

/**
 * 名次规则：金额低者靠前；金额相同，首次提交（createdAt）早者靠前。
 * 返回 supplierId → 名次（1 起）的映射。
 */
export function computeRanks(quotes: RankableQuote[]): Map<string, number> {
  const sorted = [...quotes].sort((a, b) => {
    const byAmount = Number(a.amount) - Number(b.amount);
    if (byAmount !== 0) return byAmount;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
  const ranks = new Map<string, number>();
  sorted.forEach((q, i) => ranks.set(q.supplierId, i + 1));
  return ranks;
}
