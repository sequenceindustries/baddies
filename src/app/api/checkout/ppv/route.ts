import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { postRevenueEvent, recomputeWalletBalances } from "@/lib/ledger/service";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Dummy checkout — unlock a single pay-per-view content item. See
 * src/app/api/checkout/subscribe/route.ts for the rationale on why the
 * stub path writes the ledger directly instead of waiting on a webhook.
 */
const PpvSchema = z.object({
  contentId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = PpvSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { contentId } = parsed.data;

  const content = await db.content.findUnique({
    where: { id: contentId },
    include: { creatorProfile: true },
  });
  if (!content || content.status !== "APPROVED" || !content.publishedAt) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }
  if (content.accessLevel !== "PPV") {
    return NextResponse.json({ error: "This content isn't pay-per-view." }, { status: 400 });
  }
  if (content.creatorProfile.userId === user.id) {
    return NextResponse.json({ error: "You cannot purchase your own content." }, { status: 400 });
  }
  if (!content.priceUsd) {
    return NextResponse.json({ error: "This content has no price set." }, { status: 409 });
  }

  const existing = await db.purchase.findFirst({
    where: { fanId: user.id, contentId, refundedAt: null },
  });
  if (existing) {
    return NextResponse.json({ purchased: true, alreadyOwned: true });
  }

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payment processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const priceUsd = Number(content.priceUsd);
  const provider = getPaymentProvider();
  const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
  const payment = await provider.createOneTimePayment({
    providerCustomerId: providerCustomer.providerCustomerId,
    amountUsd: priceUsd,
    metadata: { purchaseType: "PPV", contentId },
  });

  const creatorWallet = await db.wallet.upsert({
    where: { userId: content.creatorProfile.userId },
    create: { userId: content.creatorProfile.userId },
    update: {},
  });

  const purchase = await db.purchase.create({
    data: {
      fanId: user.id,
      contentId,
      priceUsd,
      paymentProviderTransactionId: payment.providerTransactionId,
    },
  });

  await postRevenueEvent({
    walletId: creatorWallet.id,
    creatorProfileId: content.creatorProfileId,
    type: "PPV",
    grossAmountUsd: priceUsd,
    referenceType: "purchase",
    referenceId: purchase.id,
    description: "Pay-per-view unlock (stub checkout)",
  });
  await recomputeWalletBalances(creatorWallet.id);

  return NextResponse.json({ purchased: true, purchaseId: purchase.id }, { status: 201 });
}
