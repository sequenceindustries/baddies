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
 * Dummy checkout — send a tip to a creator. See
 * src/app/api/checkout/subscribe/route.ts for the rationale on why the
 * stub path writes the ledger directly instead of waiting on a webhook.
 */
const TipSchema = z.object({
  creatorProfileId: z.string().min(1),
  amountUsd: z.number().positive().max(1000),
  message: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = TipSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { creatorProfileId, amountUsd, message } = parsed.data;

  const creator = await db.creatorProfile.findUnique({ where: { id: creatorProfileId } });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }
  if (creator.userId === user.id) {
    return NextResponse.json({ error: "You cannot tip your own creator profile." }, { status: 400 });
  }

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payment processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const provider = getPaymentProvider();
  const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
  const payment = await provider.createOneTimePayment({
    providerCustomerId: providerCustomer.providerCustomerId,
    amountUsd,
    metadata: { purchaseType: "TIP", creatorProfileId },
  });

  const creatorWallet = await db.wallet.upsert({
    where: { userId: creator.userId },
    create: { userId: creator.userId },
    update: {},
  });

  const tip = await db.tip.create({
    data: {
      fanId: user.id,
      creatorProfileId,
      amountUsd,
      message,
      paymentProviderTransactionId: payment.providerTransactionId,
    },
  });

  await postRevenueEvent({
    walletId: creatorWallet.id,
    creatorProfileId,
    type: "TIP",
    grossAmountUsd: amountUsd,
    referenceType: "tip",
    referenceId: tip.id,
    description: "Tip (stub checkout)",
  });
  await recomputeWalletBalances(creatorWallet.id);

  return NextResponse.json({ tipped: true, tipId: tip.id }, { status: 201 });
}
