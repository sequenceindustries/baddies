import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Commission management list (spec §8/§9) — every PartnerCommission
 * row, filterable by `?status=PENDING|HELD|REVERSED` and
 * `?partnerId=`, paginated via `?cursor=` (a commission id; pass the
 * previous page's `nextCursor` back). Ordered newest-first so a fresh
 * page load always shows the most recently-posted commissions first.
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
  const status = searchParams.get("status");
  const partnerId = searchParams.get("partnerId");
  const cursor = searchParams.get("cursor");

  const where = {
    ...(status ? { status: status as never } : {}),
    ...(partnerId ? { foundingPartnerId: partnerId } : {}),
  };

  const commissions = await db.partnerCommission.findMany({
    where,
    include: {
      foundingPartner: { select: { id: true, user: { select: { email: true } } } },
      referralAttribution: { select: { foundingApplication: { select: { stageName: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = commissions.length > PAGE_SIZE;
  const page = hasMore ? commissions.slice(0, PAGE_SIZE) : commissions;

  return NextResponse.json({
    commissions: page.map((c: (typeof page)[number]) => ({
      id: c.id,
      partnerId: c.foundingPartner.id,
      partnerEmail: c.foundingPartner.user.email,
      creatorStageName: c.referralAttribution.foundingApplication.stageName,
      creatorEmail: c.referralAttribution.foundingApplication.email,
      netEligibleAmountUsd: Number(c.netEligibleAmountUsd),
      commissionAmountUsd: Number(c.commissionAmountUsd),
      reversedAmountUsd: Number(c.reversedAmountUsd),
      status: c.status,
      heldBy: c.heldBy,
      heldReason: c.heldReason,
      heldAt: c.heldAt,
      reversedAt: c.reversedAt,
      reversalReason: c.reversalReason,
      createdAt: c.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1]!.id : null,
  });
}
