import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getPaymentProvider } from "@/lib/providers/payment";
import { postRevenueEvent, recomputeWalletBalances } from "@/lib/ledger/service";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

// A tip is a voluntary gift, not a priced product — MIN keeps it a
// real gesture rather than a fractions-of-a-cent no-op, MAX is a fat-
// finger sanity ceiling, not a real business limit.
const MIN_TIP_USD = 1;
const MAX_TIP_USD = 500;

const TipSchema = z.object({
  amountUsd: z.number().min(MIN_TIP_USD).max(MAX_TIP_USD),
  message: z.string().max(500).optional(),
});

/**
 * Social-feed redesign, per-post tip icon — a real minimal tip flow
 * (explicit product decision, see the plan). Same "dummy checkout"
 * shape as POST /api/checkout/subscribe and .../vip-pass: only ever
 * runs against the stub payment provider, then posts a real
 * LedgerEntry through the exact same wallet/ledger machinery those
 * routes use (type: "TIP" — already a valid LedgerEventType, already
 * excluded from partner-commission logic by postRevenueEvent's own
 * `type === "SUBSCRIPTION"` check, so nothing there needed to change).
 *
 * Deliberately does NOT call canAccessContent — tipping is a monetary
 * gift to the creator, not a viewing-access decision. Gating a tip jar
 * behind content unlock has no real-world analog and isn't part of
 * the existing entitlement model; the only gate here is "is this a
 * real, live post by a real creator, and you're not tipping yourself."
 */
export async function POST(req: NextRequest, { params }: { params: { contentId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = TipSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const content = await db.content.findUnique({
    where: { id: params.contentId },
    include: { creatorProfile: true },
  });
  if (!content || content.status !== "APPROVED" || content.publishedAt == null) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }
  if (content.creatorProfile.status !== "VERIFIED") {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }
  if (content.creatorProfile.userId === user.id) {
    return NextResponse.json({ error: "You cannot tip your own content." }, { status: 400 });
  }

  if (process.env.PAYMENT_PROVIDER !== "stub") {
    return NextResponse.json(
      { error: "Real payment processing isn't wired up yet — no vendor has been selected (see build brief §21)." },
      { status: 501 }
    );
  }

  const { amountUsd, message } = parsed.data;
  const creatorProfileId = content.creatorProfile.id;

  const provider = getPaymentProvider();
  const providerCustomer = await provider.createCustomer({ userId: user.id, email: user.email });
  const payment = await provider.createOneTimePayment({
    providerCustomerId: providerCustomer.providerCustomerId,
    amountUsd,
    metadata: { purchaseType: "TIP", contentId: content.id, creatorProfileId },
  });

  const tip = await db.tip.create({
    data: {
      fanId: user.id,
      creatorProfileId,
      contentId: content.id,
      amountUsd,
      message,
      paymentProviderTransactionId: payment.providerTransactionId,
    },
  });

  const creatorWallet = await db.wallet.upsert({
    where: { userId: content.creatorProfile.userId },
    create: { userId: content.creatorProfile.userId },
    update: {},
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

  const tipCount = await db.tip.count({ where: { contentId: content.id } });

  return NextResponse.json({ tipId: tip.id, amountUsd, tipCount }, { status: 201 });
}
