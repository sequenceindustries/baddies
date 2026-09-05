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

/**
 * Resolves which revenue-share rule applies to a given creator's revenue
 * event: STANDARD_CREATOR_SHARE (80%) normally, or
 * PARTNER_REFERRED_CREATOR_SHARE (85%) if this creator's original
 * Founding Baddie application is currently attributed to a Founding
 * Partner. Also returns that partner's id (or null) so the caller can
 * stamp LedgerEntry.foundingPartnerId — the partner's whole "eligible
 * reward history" is just every LedgerEntry with that id, never a
 * derived/cached figure.
 *
 * CreatorProfile has no direct FK to FoundingApplication (a Founding
 * Baddie's application predates their real account) — bridged by email,
 * the same match GET /api/admin/founding-applications/[id] already uses
 * to link a real account back to its original application.
 */
export async function resolveCreatorRevenueShare(
  creatorProfileId: string
): Promise<{ rule: RevenueShareRule; foundingPartnerId: string | null }> {
  const creatorProfile = await db.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { user: { select: { email: true } } },
  });

  if (creatorProfile) {
    const foundingApplication = await db.foundingApplication.findFirst({
      where: { email: creatorProfile.user.email },
      select: { referralAttribution: { select: { foundingPartnerId: true } } },
    });
    if (foundingApplication?.referralAttribution) {
      return {
        rule: await getCurrentRevenueShareRule("PARTNER_REFERRED_CREATOR_SHARE"),
        foundingPartnerId: foundingApplication.referralAttribution.foundingPartnerId,
      };
    }
  }

  return { rule: await getCurrentRevenueShareRule("STANDARD_CREATOR_SHARE"), foundingPartnerId: null };
}
