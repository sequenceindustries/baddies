import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Cancels the current fan's own subscription. Sets status to CANCELLED
 * immediately, which per canAccessContent's entitlement check (requires
 * status "ACTIVE") revokes access right away rather than at
 * currentPeriodEnd — there's no partial-period grace tracking yet. No
 * refund is issued for the unused remainder.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { subscriptionId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const subscription = await db.subscription.findUnique({ where: { id: params.subscriptionId } });
  if (!subscription || subscription.fanId !== user.id) {
    return NextResponse.json({ error: "Subscription not found." }, { status: 404 });
  }
  if (subscription.status === "CANCELLED") {
    return NextResponse.json({ error: "Already cancelled." }, { status: 409 });
  }

  if (subscription.paymentProviderSubscriptionId) {
    const provider = getPaymentProvider();
    await provider.cancelSubscription(subscription.paymentProviderSubscriptionId);
  }

  const updated = await db.subscription.update({
    where: { id: subscription.id },
    data: { status: "CANCELLED", cancelledAt: new Date() },
  });

  return NextResponse.json({ subscriptionId: updated.id, status: updated.status, cancelledAt: updated.cancelledAt });
}
