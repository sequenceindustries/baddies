import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Founding Partner Programme fraud/abuse review queue (spec §10) —
 * narrow, rule-based flags only (see AbuseFlag's own schema comment):
 * self-referral attempts, duplicate-application attempts, suspicious
 * refund/chargeback patterns, and a MANUAL_REVIEW catch-all for an
 * unresolvable refund/chargeback correlation. General fake accounts or
 * fraud elsewhere on the platform stay the existing Report/moderation
 * system's job, not duplicated here.
 *
 * Defaults to `?status=OPEN` (the actual queue an admin needs to work)
 * — pass `?status=` (empty) for every status, or a specific one.
 * `?type=` and `?partnerId=` narrow further.
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
  const statusParam = searchParams.get("status");
  const status = statusParam === null ? "OPEN" : statusParam;
  const type = searchParams.get("type");
  const partnerId = searchParams.get("partnerId");

  const flags = await db.abuseFlag.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(type ? { type: type as never } : {}),
      ...(partnerId ? { foundingPartnerId: partnerId } : {}),
    },
    include: {
      foundingPartner: { select: { id: true, user: { select: { email: true } } } },
      foundingApplication: { select: { id: true, stageName: true, email: true } },
      referralAttribution: { select: { id: true, foundingApplication: { select: { stageName: true } } } },
      partnerCommission: { select: { id: true, commissionAmountUsd: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    flags: flags.map((f: (typeof flags)[number]) => ({
      id: f.id,
      type: f.type,
      status: f.status,
      reason: f.reason,
      autoDetected: f.autoDetected,
      partnerId: f.foundingPartner?.id ?? null,
      partnerEmail: f.foundingPartner?.user.email ?? null,
      foundingApplicationId: f.foundingApplication?.id ?? null,
      applicationStageName: f.foundingApplication?.stageName ?? f.referralAttribution?.foundingApplication.stageName ?? null,
      referralAttributionId: f.referralAttribution?.id ?? null,
      partnerCommissionId: f.partnerCommission?.id ?? null,
      commissionAmountUsd: f.partnerCommission ? Number(f.partnerCommission.commissionAmountUsd) : null,
      reviewedBy: f.reviewedBy,
      reviewedAt: f.reviewedAt,
      resolutionNotes: f.resolutionNotes,
      createdAt: f.createdAt,
    })),
  });
}
