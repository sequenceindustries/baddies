import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The current user's own wallet balance. Balances are a read model
 * recomputed by src/lib/ledger/service.ts#recomputeWalletBalances from
 * LedgerEntry history — never hand-edited (see that module's header
 * comment). Only exposes the caller's own wallet; no other user's balance
 * is ever returned from this route.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const wallet = await db.wallet.upsert({
    where: { userId: user.id },
    create: { userId: user.id },
    update: {},
  });

  return NextResponse.json({
    pendingBalanceUsd: Number(wallet.cachedPendingBalanceUsd),
    availableBalanceUsd: Number(wallet.cachedAvailableBalanceUsd),
    paidBalanceUsd: Number(wallet.cachedPaidBalanceUsd),
    balanceRecomputedAt: wallet.balanceRecomputedAt,
  });
}
