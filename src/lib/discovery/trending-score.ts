/**
 * Pure trending scoring logic — deliberately has NO import of the db
 * client, so it can be unit tested without a Prisma client / Postgres
 * connection. src/lib/discovery/trending.ts wires this to real queries.
 */

export interface CountRow {
  contentId: string;
  count: number;
}

export interface TrendingContentResult {
  contentId: string;
  score: number;
}

export const TRENDING_RESULT_LIMIT = 20;

/**
 * Purchases are weighted higher than a qualifying consumption event by
 * default — an explicit, documented choice, not a magic number buried in
 * a query. See build brief §11 ("Trending").
 */
export function aggregateTrendingScores(
  consumptionCounts: CountRow[],
  purchaseCounts: CountRow[],
  purchaseWeight = 3,
  limit = TRENDING_RESULT_LIMIT
): TrendingContentResult[] {
  const scoreByContent = new Map<string, number>();

  for (const row of consumptionCounts) {
    scoreByContent.set(row.contentId, (scoreByContent.get(row.contentId) ?? 0) + row.count);
  }
  for (const row of purchaseCounts) {
    scoreByContent.set(row.contentId, (scoreByContent.get(row.contentId) ?? 0) + row.count * purchaseWeight);
  }

  return Array.from(scoreByContent.entries())
    .map(([contentId, score]) => ({ contentId, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
