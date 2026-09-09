import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Requests a payout of a Founding Partner's full current available
 * commission balance — near-line-for-line the same flow as
 * src/app/api/creator/payout/route.ts, reusing the exact same Payout
 * model and the exact same admin approval route
 * (POST /api/admin/payouts/[payoutId]/approve), which already works
 * for any wallet regardless of whose it is.
 *
 * Authorized by row ownership (this FoundingPartner.userId === the
 * current user's id), not a role permission — PARTNER's own
 * ROLE_PERMISSIONS entry is deliberately just ["creator:apply"] (see
 * that file's own comment), matching how every other partner-owned
 * route in this codebase authorizes.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const partner = await db.foundingPartner.findUnique({ where: { userId: user.id } });
  if (!partner) {
    return NextResponse.json({ error: "No Founding Partner record found for this account." }, { status: 404 });
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
