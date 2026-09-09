import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Server-computed CSV export of every PartnerCommission (spec §8 —
 * "export commission data"). Every figure here is computed server-side
 * from the real stored rows, never assembled from whatever a client
 * happened to have loaded/filtered — so an export always reflects the
 * true, complete data regardless of what page of the admin UI was open.
 * Optional `?status=` filters the same way the list route does.
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

  const commissions = await db.partnerCommission.findMany({
    where: status ? { status: status as never } : {},
    include: {
      foundingPartner: { select: { user: { select: { email: true } } } },
      referralAttribution: { select: { foundingApplication: { select: { stageName: true, email: true } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  const header = [
    "commission_id",
    "partner_email",
    "creator_stage_name",
    "creator_email",
    "net_eligible_amount_usd",
    "commission_amount_usd",
    "reversed_amount_usd",
    "status",
    "held_by",
    "held_reason",
    "held_at",
    "reversed_at",
    "reversal_reason",
    "created_at",
  ];

  const rows = commissions.map((c: (typeof commissions)[number]) =>
    [
      c.id,
      c.foundingPartner.user.email,
      c.referralAttribution.foundingApplication.stageName,
      c.referralAttribution.foundingApplication.email,
      c.netEligibleAmountUsd.toString(),
      c.commissionAmountUsd.toString(),
      c.reversedAmountUsd.toString(),
      c.status,
      c.heldBy ?? "",
      c.heldReason ?? "",
      c.heldAt?.toISOString() ?? "",
      c.reversedAt?.toISOString() ?? "",
      c.reversalReason ?? "",
      c.createdAt.toISOString(),
    ]
      .map(csvEscape)
      .join(",")
  );

  const csv = [header.join(","), ...rows].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="partner-commissions-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
