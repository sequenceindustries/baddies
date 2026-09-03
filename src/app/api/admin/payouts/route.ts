import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { PayoutStatus, Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const STATUSES: PayoutStatus[] = ["REQUESTED", "APPROVED", "PROCESSING", "PAID", "FAILED", "REVERSED"];

/**
 * Two modes on one route, kept backward-compatible: with no `status`
 * param this is exactly the approval queue it always was — REQUESTED
 * only, same shape, PayoutQueue's existing behavior untouched. With a
 * `status` param (including "all") it's Payout History: every payout,
 * filterable, cursor-paginated, with a statusCounts breakdown for the
 * history's stat chips.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "payout:approve");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const params = req.nextUrl.searchParams;
  const statusParam = params.get("status");

  if (!statusParam) {
    const payouts = await db.payout.findMany({
      where: { status: "REQUESTED" },
      orderBy: { requestedAt: "asc" },
      take: 50,
      include: { wallet: { select: { user: { select: { email: true } } } } },
    });

    return NextResponse.json({
      payouts: payouts.map((p: (typeof payouts)[number]) => ({
        payoutId: p.id,
        walletId: p.walletId,
        creatorEmail: p.wallet.user.email,
        amountUsd: Number(p.amountUsd),
        requestedAt: p.requestedAt,
      })),
    });
  }

  // History mode.
  const status = STATUSES.includes(statusParam as PayoutStatus) ? (statusParam as PayoutStatus) : undefined;
  const query = params.get("query")?.trim();
  const since = params.get("since");
  const until = params.get("until");
  const cursor = params.get("cursor") ?? undefined;

  const where: Prisma.PayoutWhereInput = {
    ...(status ? { status } : {}),
    ...(since || until
      ? {
          requestedAt: {
            ...(since ? { gte: new Date(since) } : {}),
            ...(until ? { lte: new Date(until) } : {}),
          },
        }
      : {}),
    ...(query ? { wallet: { user: { email: { contains: query, mode: "insensitive" } } } } : {}),
  };

  const [rows, statusCounts, paidSum] = await Promise.all([
    db.payout.findMany({
      where,
      orderBy: { requestedAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { wallet: { select: { user: { select: { email: true } } } } },
    }),
    db.payout.groupBy({ by: ["status"], _count: { _all: true } }),
    db.payout.aggregate({ where: { status: "PAID" }, _sum: { amountUsd: true } }),
  ]);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<PayoutStatus, number>;
  for (const row of statusCounts) counts[row.status] = row._count._all;

  return NextResponse.json({
    items: page.map((p) => ({
      payoutId: p.id,
      creatorEmail: p.wallet.user.email,
      amountUsd: p.amountUsd.toString(),
      status: p.status,
      requestedAt: p.requestedAt,
      processedAt: p.processedAt,
      failureReason: p.failureReason,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
    statusCounts: { ...counts, totalPaidUsd: (paidSum._sum.amountUsd ?? 0).toString() },
  });
}
