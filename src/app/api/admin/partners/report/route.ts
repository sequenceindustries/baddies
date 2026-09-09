import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Founding Baddie / Founding Partner recruitment reporting (spec §7) —
 * separate from GET /api/admin/partners (which is the partner ROSTER
 * with per-partner detail) and from the Command Centre's own Founding
 * Baddies funnel (which tracks the pipeline, not partner attribution
 * specifically). Every figure here is a live aggregate, not a cached
 * projection, so it always reflects the current real state.
 */
export async function GET() {
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

  const [totalFoundingBaddies, target, referredByPartnerCount, attributionsByPartner, partners] = await Promise.all([
    db.foundingApplication.count({ where: { status: { not: "REJECTED" } } }),
    getPlatformSetting(BUSINESS_CONFIG_KEYS.FOUNDING_BADDIES_TARGET),
    db.referralAttribution.count({ where: { foundingApplication: { status: { not: "REJECTED" } } } }),
    db.referralAttribution.groupBy({
      by: ["foundingPartnerId"],
      where: { foundingApplication: { status: { not: "REJECTED" } } },
      _count: { _all: true },
    }),
    db.foundingPartner.findMany({ select: { id: true, referralCode: true, user: { select: { email: true } } } }),
  ]);

  const partnerById = new Map(partners.map((p: (typeof partners)[number]) => [p.id, p]));
  const creatorsPerPartner = attributionsByPartner
    .map((a: (typeof attributionsByPartner)[number]) => {
      const partner = partnerById.get(a.foundingPartnerId);
      return {
        partnerId: a.foundingPartnerId,
        partnerEmail: partner?.user.email ?? "unknown",
        referralCode: partner?.referralCode ?? "unknown",
        creatorsReferred: a._count._all,
      };
    })
    .sort((a: { creatorsReferred: number }, b: { creatorsReferred: number }) => b.creatorsReferred - a.creatorsReferred);

  const targetNumber = Number(target) || 300;

  return NextResponse.json({
    totalFoundingBaddies,
    target: targetNumber,
    remainingToTarget: Math.max(targetNumber - totalFoundingBaddies, 0),
    totalReferredByPartners: referredByPartnerCount,
    creatorsPerPartner,
    topPartners: creatorsPerPartner.slice(0, 10),
  });
}
