import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Requests a payout of the creator's full current available balance
 * (see src/lib/ledger/service.ts#recomputeWalletBalances for how that's
 * derived). This only creates the Payout row in REQUESTED status — no
 * money moves and no ledger entry is posted until an admin approves it
 * (POST /api/admin/payouts/:id/approve), matching the two-step flow the
 * PayoutStatus enum implies.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "payout:request");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const wallet = await db.wallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  const availableUsd = Number(wallet.cachedAvailableBalanceUsd);
  if (availableUsd <= 0) {
    return NextResponse.json({ error: "No available balance to pay out." }, { status: 409 });
  }

  const existingRequest = await db.payout.findFirst({
    where: { walletId: wallet.id, status: { in: ["REQUESTED", "APPROVED", "PROCESSING"] } },
  });
  if (existingRequest) {
    return NextResponse.json({ error: "A payout is already pending for this wallet." }, { status: 409 });
  }

  const payout = await db.payout.create({
    data: { walletId: wallet.id, amountUsd: availableUsd, status: "REQUESTED" },
  });

  return NextResponse.json(
    { payoutId: payout.id, amountUsd: Number(payout.amountUsd), status: payout.status },
    { status: 201 }
  );
}
