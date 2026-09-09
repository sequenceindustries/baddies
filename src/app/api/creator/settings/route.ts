import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveCreatorPricing, EXCLUSIVE_MIN_PRICE_USD } from "@/lib/creator/pricing";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The current user's own creator settings: Exclusive subscription price,
 * privacy toggles, and VIP pass opt-in (unlimitedOptedIn — see
 * prisma/schema.prisma's ContentAccessLevel comment for the full tier
 * model). Distinct from PATCH /api/profile (display name/bio/avatar) and
 * from admin actions (verification status) — a creator can never change
 * their own CreatorStatus here.
 *
 * effectiveVvipPriceUsd is always resolveCreatorPricing's output (the
 * creator's own price if they've set one, otherwise the platform
 * default) — see that function's own comment.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creator = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creator) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }

  const pricing = await resolveCreatorPricing(creator);

  return NextResponse.json({
    effectiveVvipPriceUsd: pricing.vvipPriceUsd,
    unlimitedOptedIn: creator.unlimitedOptedIn,
    subscriberCountVisible: creator.subscriberCountVisible,
    locationVisible: creator.locationVisible,
    coverImageUrl: creator.coverImageUrl,
  });
}

const UpdateSettingsSchema = z.object({
  unlimitedOptedIn: z.boolean().optional(),
  subscriberCountVisible: z.boolean().optional(),
  locationVisible: z.boolean().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  exclusivePriceUsd: z
    .number()
    .min(EXCLUSIVE_MIN_PRICE_USD, `Must be at least $${EXCLUSIVE_MIN_PRICE_USD}.`)
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creator = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creator) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateSettingsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { exclusivePriceUsd, ...rest } = parsed.data;

  const updated = await db.creatorProfile.update({
    where: { id: creator.id },
    data: {
      ...rest,
      ...(exclusivePriceUsd !== undefined
        ? { vvipPriceOverride: new Prisma.Decimal(exclusivePriceUsd) }
        : {}),
    },
  });

  const pricing = await resolveCreatorPricing(updated);

  return NextResponse.json({
    effectiveVvipPriceUsd: pricing.vvipPriceUsd,
    unlimitedOptedIn: updated.unlimitedOptedIn,
    subscriberCountVisible: updated.subscriberCountVisible,
    locationVisible: updated.locationVisible,
    coverImageUrl: updated.coverImageUrl,
  });
}
