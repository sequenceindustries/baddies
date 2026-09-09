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
 * event, and whether that event should also credit a Founding Partner.
 *
 * Founding Partner Programme v2: every creator — referred or not — gets
 * the flat STANDARD_CREATOR_SHARE (80%). A referred creator's higher
 * personal cut (the old PARTNER_REFERRED_CREATOR_SHARE / 85% mechanism)
 * is retired; the platform's former extra 5% instead funds the
 * partner's own 10% commission (see PartnerCommission / postRevenueEvent
 * in src/lib/ledger/service.ts). This function still resolves and
 * returns the attribution itself (foundingPartnerId +
 * referralAttributionId) so the caller can both stamp
 * LedgerEntry.foundingPartnerId (attribution/reporting, unconditional)
 * and — for a SUBSCRIPTION event only — compute that partner's
 * commission against the correct ReferralAttribution row.
 *
 * CreatorProfile has no direct FK to FoundingApplication (a Founding
 * Baddie's application predates their real account) — bridged by email,
 * the same match GET /api/admin/founding-applications/[id] already uses
 * to link a real account back to its original application.
 */
export async function resolveCreatorRevenueShare(
  creatorProfileId: string
): Promise<{ rule: RevenueShareRule; foundingPartnerId: string | null; referralAttributionId: string | null }> {
  const rule = await getCurrentRevenueShareRule("STANDARD_CREATOR_SHARE");

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { id: creatorProfileId },
    select: { user: { select: { email: true } } },
  });

  if (creatorProfile) {
    const foundingApplication = await db.foundingApplication.findFirst({
      where: { email: creatorProfile.user.email },
      select: { referralAttribution: { select: { id: true, foundingPartnerId: true } } },
    });
    if (foundingApplication?.referralAttribution) {
      return {
        rule,
        foundingPartnerId: foundingApplication.referralAttribution.foundingPartnerId,
        referralAttributionId: foundingApplication.referralAttribution.id,
      };
    }
  }

  return { rule, foundingPartnerId: null, referralAttributionId: null };
}
