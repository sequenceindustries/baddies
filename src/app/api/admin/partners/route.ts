import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Full Founding Partner roster with embedded referral + ledger detail —
 * one GET, not paginated: the programme is capped at 10 partners total,
 * so there's no dataset-size reason to split this into a list route plus
 * a per-partner detail route the way CreatorQueue/FoundingApplicationsQueue
 * need to for their much larger tables.
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

  const partners = await db.foundingPartner.findMany({
    orderBy: { activatedAt: "asc" },
    include: {
      user: { select: { email: true } },
      referralAttributions: {
        include: {
          foundingApplication: { select: { id: true, stageName: true, email: true, status: true } },
        },
      },
      ledgerEntries: {
        select: { id: true, type: true, grossAmount: true, creatorShareAmount: true, platformShareAmount: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return NextResponse.json({
    partners: partners.map((p: (typeof partners)[number]) => ({
      id: p.id,
      email: p.user.email,
      referralCode: p.referralCode,
      status: p.status,
      activatedAt: p.activatedAt,
      referredCreators: p.referralAttributions.map((a: (typeof p.referralAttributions)[number]) => ({
        foundingApplicationId: a.foundingApplication.id,
        stageName: a.foundingApplication.stageName,
        email: a.foundingApplication.email,
        status: a.foundingApplication.status,
        correctedBy: a.correctedBy,
        correctionReason: a.correctionReason,
      })),
      ledgerEntryCount: p.ledgerEntries.length,
      ledgerEntries: p.ledgerEntries.slice(0, 20),
    })),
  });
}
