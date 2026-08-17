import { db } from "@/lib/db/client";
import { aggregateTrendingScores, type TrendingContentResult } from "./trending-score";

export type { TrendingContentResult };

const TRENDING_WINDOW_DAYS = 7;

/**
 * "Trending" per build brief §11. Deliberately a simple, explainable
 * recency-weighted engagement count rather than a black-box ranking
 * model — build brief §31 explicitly excludes "Complex recommendation AI"
 * from MVP scope. Engagement signals counted: qualified consumption
 * events and PPV purchases attributed to the content, within a rolling
 * window. Scoring math itself lives in ./trending-score.ts so it can be
 * unit tested independent of the DB.
 */
export async function computeTrendingContent(): Promise<TrendingContentResult[]> {
  const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [consumptionCounts, purchaseCounts] = await Promise.all([
    db.qualifiedConsumptionEvent.groupBy({
      by: ["contentId"],
      where: { qualifiesAt: { gte: since } },
      _count: { _all: true },
    }),
    db.purchase.groupBy({
      by: ["contentId"],
      where: { createdAt: { gte: since }, refundedAt: null },
      _count: { _all: true },
    }),
  ]);

  return aggregateTrendingScores(
    consumptionCounts.map((r: (typeof consumptionCounts)[number]) => ({ contentId: r.contentId, count: r._count._all })),
    purchaseCounts.map((r: (typeof purchaseCounts)[number]) => ({ contentId: r.contentId, count: r._count._all }))
  );
}
