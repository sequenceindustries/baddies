import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { postPayoutEvent, recomputeWalletBalances } from "@/lib/ledger/service";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Approves a payout request. Like the dummy checkout routes (see
 * src/app/api/checkout/subscribe/route.ts for the rationale), this
 * completes synchronously against the stub PaymentProvider — calls
 * provider.createPayout(), posts the PAYOUT ledger entry immediately, and
 * marks the payout PAID, skipping the APPROVED/PROCESSING intermediate
 * states a real, asynchronous payout provider would actually need. A real
 * provider integration should stop marking PAID here and instead wait for
 * that provider's own payout-completion webhook.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { payoutId: string } }
) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(admin.role, "payout:approve");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const payout = await db.payout.findUnique({ where: { id: params.payoutId } });
  if (!payout) {
    return NextResponse.json({ error: "Payout not found." }, { status: 404 });
  }
  if (payout.status !== "REQUESTED") {
    return NextResponse.json({ error: `Payout is not pending (status: ${payout.status}).` }, { status: 409 });
  }

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payout processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const provider = getPaymentProvider();
  const result = await provider.createPayout({
    providerAccountId: `stub_account_${payout.walletId}`,
    amountUsd: Number(payout.amountUsd),
    currency: "USD",
  });

  // Sequential, not a single transaction: postPayoutEvent/recomputeWalletBalances
  // use the module-level db client rather than accepting a tx handle, same
  // as every other ledger-writing route in this codebase (see
  // src/app/api/checkout/subscribe/route.ts).
  const updated = await db.payout.update({
    where: { id: payout.id },
    data: { status: "PAID", processedAt: new Date(), paymentProviderPayoutId: result.providerPayoutId },
  });

  await postPayoutEvent({ walletId: payout.walletId, payoutId: payout.id, amountUsd: Number(payout.amountUsd) });
  await recomputeWalletBalances(payout.walletId);

  await db.auditLog.create({
    data: {
      actorId: admin.id,
      action: "payout.approve",
      targetType: "payout",
      targetId: payout.id,
      ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
    },
  });

  return NextResponse.json({ payoutId: updated.id, status: updated.status });
}
