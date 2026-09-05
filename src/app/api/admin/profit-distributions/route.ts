import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const UpsertSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  totalDistributableProfitUsd: z.number().nonnegative(),
});

/**
 * Founding Partners' annual profit-pool participation — real, admin-
 * entered figures only. This route creates or updates a DRAFT year
 * record with the real total distributable profit; it never estimates,
 * projects, or computes that figure itself, since there's no live
 * payment provider yet to derive real financial results from. See
 * .../[id]/finalize for the one calculation this project does perform,
 * and only once real numbers exist here.
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

  const distributions = await db.annualProfitDistribution.findMany({
    orderBy: { year: "desc" },
    include: { partnerShares: { include: { foundingPartner: { include: { user: { select: { email: true } } } } } } },
  });

  return NextResponse.json({
    distributions: distributions.map((d: (typeof distributions)[number]) => ({
      id: d.id,
      year: d.year,
      status: d.status,
      totalDistributableProfitUsd: d.totalDistributableProfitUsd,
      computedAt: d.computedAt,
      finalizedAt: d.finalizedAt,
      partnerShares: d.partnerShares.map((s: (typeof d.partnerShares)[number]) => ({
        foundingPartnerId: s.foundingPartnerId,
        partnerEmail: s.foundingPartner.user.email,
        amountUsd: s.amountUsd,
      })),
    })),
  });
}

export async function POST(req: NextRequest) {
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

  const json = await req.json().catch(() => null);
  const parsed = UpsertSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { year, totalDistributableProfitUsd } = parsed.data;

  const existing = await db.annualProfitDistribution.findUnique({ where: { year } });
  if (existing?.status === "FINALIZED") {
    return NextResponse.json({ error: `${year} has already been finalized and can't be edited.` }, { status: 409 });
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const distribution = await tx.annualProfitDistribution.upsert({
      where: { year },
      create: {
        year,
        totalDistributableProfitUsd,
        computedBy: user.id,
        computedAt: new Date(),
      },
      update: {
        totalDistributableProfitUsd,
        computedBy: user.id,
        computedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_partner.profit_distribution_recorded",
        targetType: "annual_profit_distribution",
        targetId: distribution.id,
        metadata: { year, totalDistributableProfitUsd },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return distribution;
  });

  return NextResponse.json({ id: result.id, year: result.year, status: result.status });
}
