import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/** Admin payout-request queue — REQUESTED payouts awaiting approval. */
export async function GET() {
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
