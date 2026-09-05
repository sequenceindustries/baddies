import { db } from "@/lib/db/client";
import type { RevenueShareRuleType, RevenueShareRule } from "@prisma/client";

/**
 * Reads the currently-effective RevenueShareRule for a given type — the
 * versioned commercial-config model for the Founding Partners project
 * (see prisma/schema.prisma's own comment on why this exists instead of
 * another PlatformSetting key: PlatformSetting mutates in place and keeps
 * no history, which the "retain historical rule versions" requirement
 * rules out).
 *
 * "Currently effective" = the row with the latest `effectiveAt` that is
 * not in the future, mirroring how the Founding onboarding-banking route
 * already picks the "current" Agreement per type. Throws if no rule of
 * this type has been seeded at all — same fail-loud posture
 * getBusinessConfig() takes for a missing/inconsistent revenue split,
 * rather than silently defaulting to a guessed percentage for money-
 * adjacent logic.
 */
export async function getCurrentRevenueShareRule(type: RevenueShareRuleType): Promise<RevenueShareRule> {
  const rule = await db.revenueShareRule.findFirst({
    where: { type, effectiveAt: { lte: new Date() } },
    orderBy: { effectiveAt: "desc" },
  });

  if (!rule) {
    throw new Error(
      `[revenue-rules] No RevenueShareRule found for type "${type}". Run prisma/seed.ts.`
    );
  }

  return rule;
}
