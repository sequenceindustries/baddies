import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Flat, filterable list of every ReferralAttribution — the admin
 * "Referrals" view (spec §8): partner, creator, referral/activation
 * dates, attribution status including any correction trail, revenue,
 * commission, earning-period start/end. Not paginated: with a 50-
 * partner cap and each partner recruiting toward a shared 300-Baddie
 * target, this table stays small (a few hundred rows at most).
 *
 * Optional `?status=` filters by the referred creator's own
 * FoundingApplicationStatus (e.g. LIVE), and `?partnerId=` restricts to
 * one partner — both applied server-side, never left to the client to
 * filter a full unfiltered dump.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "founding_partner:manage");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status");
  const partnerIdFilter = searchParams.get("partnerId");

  const attributions = await db.referralAttribution.findMany({
    where: {
      ...(partnerIdFilter ? { foundingPartnerId: partnerIdFilter } : {}),
      ...(statusFilter ? { foundingApplication: { status: statusFilter as never } } : {}),
    },
    include: {
      foundingApplication: { select: { id: true, stageName: true, email: true, status: true, createdAt: true } },
      foundingPartner: { select: { id: true, referralCode: true, user: { select: { email: true } } } },
    },
    orderBy: { attributedAt: "desc" },
  });

  const attributionIds = attributions.map((a: (typeof attributions)[number]) => a.id);
  const commissionAgg = attributionIds.length
    ? await db.partnerCommission.groupBy({
        by: ["referralAttributionId"],
        where: { referralAttributionId: { in: attributionIds } },
        _sum: { commissionAmountUsd: true, reversedAmountUsd: true },
      })
    : [];
  const commissionByAttributionId = new Map(
    commissionAgg.map((c: (typeof commissionAgg)[number]) => [
      c.referralAttributionId,
      Number(c._sum.commissionAmountUsd ?? 0) - Number(c._sum.reversedAmountUsd ?? 0),
    ])
  );

  // Revenue is keyed by creatorProfileId on LedgerEntry, not by this
  // attribution directly (same email bridge every other route in this
  // programme uses) — resolved in bulk here rather than N+1 per row.
  const applicantEmails = attributions.map((a: (typeof attributions)[number]) => a.foundingApplication.email);
  const creatorProfiles = applicantEmails.length
    ? await db.creatorProfile.findMany({
        where: { user: { email: { in: applicantEmails } } },
        select: { id: true, user: { select: { email: true } } },
      })
    : [];
  const creatorProfileIdByEmail = new Map(
    creatorProfiles.map((c: (typeof creatorProfiles)[number]) => [c.user.email.toLowerCase(), c.id])
  );
  const creatorProfileIds = [...creatorProfileIdByEmail.values()];
  const revenueAgg = creatorProfileIds.length
    ? await db.ledgerEntry.groupBy({
        by: ["creatorProfileId"],
        where: { creatorProfileId: { in: creatorProfileIds }, type: "SUBSCRIPTION" },
        _sum: { grossAmount: true },
      })
    : [];
  const revenueByCreatorProfileId = new Map(
    revenueAgg.map((r: (typeof revenueAgg)[number]) => [r.creatorProfileId as string, Number(r._sum.grossAmount ?? 0)])
  );

  const now = new Date();

  return NextResponse.json({
    referrals: attributions.map((a: (typeof attributions)[number]) => {
      const creatorProfileId = creatorProfileIdByEmail.get(a.foundingApplication.email.toLowerCase()) ?? null;
      const earningPeriodStatus: "NOT_STARTED" | "ACTIVE" | "EXPIRED" = !a.earningPeriodEndAt
        ? "NOT_STARTED"
        : a.earningPeriodEndAt.getTime() > now.getTime()
          ? "ACTIVE"
          : "EXPIRED";
      return {
        referralAttributionId: a.id,
        partnerId: a.foundingPartner.id,
        partnerEmail: a.foundingPartner.user.email,
        partnerReferralCode: a.foundingPartner.referralCode,
        foundingApplicationId: a.foundingApplication.id,
        stageName: a.foundingApplication.stageName,
        creatorEmail: a.foundingApplication.email,
        creatorStatus: a.foundingApplication.status,
        referredAt: a.foundingApplication.createdAt,
        attributedAt: a.attributedAt,
        correctedBy: a.correctedBy,
        correctedAt: a.correctedAt,
        correctionReason: a.correctionReason,
        subscriptionRevenueGeneratedUsd: creatorProfileId ? revenueByCreatorProfileId.get(creatorProfileId) ?? 0 : 0,
        commissionGeneratedUsd: commissionByAttributionId.get(a.id) ?? 0,
        earningPeriodStartAt: a.earningPeriodStartAt,
        earningPeriodEndAt: a.earningPeriodEndAt,
        earningPeriodStatus,
      };
    }),
  });
}
