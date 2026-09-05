import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { getCurrentRevenueShareRule } from "@/lib/config/revenue-rules";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The one calculation this project performs for profit-pool
 * participation — and only once, at admin's explicit request, from the
 * real totalDistributableProfitUsd already recorded on this
 * distribution (see POST /api/admin/profit-distributions). Computes the
 * partners' collective pool as totalDistributableProfitUsd × the
 * current PARTNER_PROFIT_POOL_SHARE rule (10%), split evenly across
 * every currently-ACTIVE Founding Partner, writes one PartnerProfitShare
 * row per partner, and marks the distribution FINALIZED — a one-way
 * action per year, never recomputed or edited afterward (this route
 * refuses to run twice for the same distribution). Zero partners active
 * at finalize time is a real, honest state (a fully unallocated pool),
 * not an error.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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

  const distribution = await db.annualProfitDistribution.findUnique({ where: { id: params.id } });
  if (!distribution) {
    return NextResponse.json({ error: "Distribution not found." }, { status: 404 });
  }
  if (distribution.status === "FINALIZED") {
    return NextResponse.json({ error: "This distribution has already been finalized." }, { status: 409 });
  }
  if (distribution.totalDistributableProfitUsd == null) {
    return NextResponse.json({ error: "Record a total distributable profit figure before finalizing." }, { status: 409 });
  }

  const poolRule = await getCurrentRevenueShareRule("PARTNER_PROFIT_POOL_SHARE");
  const activePartners = await db.foundingPartner.findMany({ where: { status: "ACTIVE" } });

  const totalProfit = Number(distribution.totalDistributableProfitUsd);
  const partnerPoolUsd = Math.round(totalProfit * Number(poolRule.percentage) * 100) / 100;
  const perPartnerUsd =
    activePartners.length > 0 ? Math.round((partnerPoolUsd / activePartners.length) * 100) / 100 : 0;

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const partner of activePartners) {
      await tx.partnerProfitShare.create({
        data: { distributionId: distribution.id, foundingPartnerId: partner.id, amountUsd: perPartnerUsd },
      });
    }
    const updated = await tx.annualProfitDistribution.update({
      where: { id: distribution.id },
      data: { status: "FINALIZED", finalizedBy: user.id, finalizedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_partner.profit_distribution_finalized",
        targetType: "annual_profit_distribution",
        targetId: distribution.id,
        metadata: {
          year: distribution.year,
          totalDistributableProfitUsd: totalProfit,
          poolRuleId: poolRule.id,
          poolRulePercentage: poolRule.percentage,
          partnerPoolUsd,
          activePartnerCount: activePartners.length,
          perPartnerUsd,
        },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return updated;
  });

  return NextResponse.json({
    id: result.id,
    status: result.status,
    partnerPoolUsd,
    activePartnerCount: activePartners.length,
    perPartnerUsd,
  });
}
