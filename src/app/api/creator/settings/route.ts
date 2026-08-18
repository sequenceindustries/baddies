import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveCreatorPricing } from "@/lib/creator/pricing";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The current user's own creator settings: VVIP subscription price
 * override (null = fall back to the platform default, see
 * resolveCreatorPricing), privacy toggles, and VIP pass opt-in
 * (unlimitedOptedIn — see prisma/schema.prisma's ContentAccessLevel
 * comment for the full tier model). Distinct from PATCH /api/profile
 * (display name/bio/avatar) and from admin actions (verification status)
 * — a creator can never change their own CreatorStatus here.
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
    vvipPriceOverride: creator.vvipPriceOverride != null ? Number(creator.vvipPriceOverride) : null,
    effectiveVvipPriceUsd: pricing.vvipPriceUsd,
    unlimitedOptedIn: creator.unlimitedOptedIn,
    subscriberCountVisible: creator.subscriberCountVisible,
    locationVisible: creator.locationVisible,
    coverImageUrl: creator.coverImageUrl,
  });
}

const UpdateSettingsSchema = z.object({
  vvipPriceOverride: z.number().positive().nullable().optional(),
  unlimitedOptedIn: z.boolean().optional(),
  subscriberCountVisible: z.boolean().optional(),
  locationVisible: z.boolean().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
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

  if (parsed.data.vvipPriceOverride != null && creator.status !== "VERIFIED") {
    return NextResponse.json(
      { error: "Only verified creators can set custom pricing." },
      { status: 403 }
    );
  }

  const updated = await db.creatorProfile.update({
    where: { id: creator.id },
    data: parsed.data,
  });

  return NextResponse.json({
    vvipPriceOverride: updated.vvipPriceOverride != null ? Number(updated.vvipPriceOverride) : null,
    unlimitedOptedIn: updated.unlimitedOptedIn,
    subscriberCountVisible: updated.subscriberCountVisible,
    locationVisible: updated.locationVisible,
    coverImageUrl: updated.coverImageUrl,
  });
}
