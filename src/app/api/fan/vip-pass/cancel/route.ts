import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Cancels the current fan's own platform-wide VIP pass. Same immediate-
 * revocation behavior as POST /api/fan/subscriptions/:id/cancel — sets
 * status CANCELLED right away, which per the entitlement engine's active
 * VIP-pass check (status "ACTIVE" required) revokes access immediately
 * rather than at currentPeriodEnd.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const vipPass = await db.unlimitedSubscription.findFirst({
    where: { fanId: user.id, status: "ACTIVE" },
  });
  if (!vipPass) {
    return NextResponse.json({ error: "No active VIP pass to cancel." }, { status: 404 });
  }

  if (vipPass.paymentProviderSubscriptionId) {
    const provider = getPaymentProvider();
    await provider.cancelSubscription(vipPass.paymentProviderSubscriptionId);
  }

  const updated = await db.unlimitedSubscription.update({
    where: { id: vipPass.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return NextResponse.json({ subscriptionId: updated.id, status: updated.status, cancelledAt: updated.cancelledAt });
}
