import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveCreatorPricing, EXCLUSIVE_MIN_PRICE_USD } from "@/lib/creator/pricing";
import { persistPublicImage, publicImageUrlSchema } from "@/lib/media/persist-public-image";

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
    handle: creator.handle,
  });
}

// Lowercase letters, digits, underscores — the same shape Instagram/
// Twitter-style handles use elsewhere. Enforced here in application
// code (Zod), not a DB CHECK constraint, matching this schema's own
// existing convention (see e.g. EXCLUSIVE_MIN_PRICE_USD's own comment
// on where format/business rules for this route live).
const HANDLE_REGEX = /^[a-z0-9_]{3,20}$/;

const UpdateSettingsSchema = z.object({
  unlimitedOptedIn: z.boolean().optional(),
  subscriberCountVisible: z.boolean().optional(),
  locationVisible: z.boolean().optional(),
  coverImageUrl: publicImageUrlSchema.nullable().optional(),
  exclusivePriceUsd: z
    .number()
    .min(EXCLUSIVE_MIN_PRICE_USD, `Must be at least $${EXCLUSIVE_MIN_PRICE_USD}.`)
    .optional(),
  // null clears a previously-set handle back to unset; omitted leaves
  // it untouched. Never auto-generated from displayName — a creator
  // picks their own, same as any real social platform's handle field.
  handle: z
    .string()
    .nullable()
    .refine((v) => v === null || HANDLE_REGEX.test(v), {
      message: "Handle must be 3-20 characters: lowercase letters, numbers, and underscores only.",
    })
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
  const { exclusivePriceUsd, coverImageUrl, ...rest } = parsed.data;

  // FeaturedImagePanel (src/app/profile/page.tsx) sends a raw data: URL
  // via ImageUploadField — see persist-public-image.ts's own comment
  // for why that must never be persisted (or served back) as-is.
  const persistedCoverImageUrl = await persistPublicImage(coverImageUrl, `public/covers/${creator.id}`);

  let updated;
  try {
    updated = await db.creatorProfile.update({
      where: { id: creator.id },
      data: {
        ...rest,
        coverImageUrl: persistedCoverImageUrl,
        ...(exclusivePriceUsd !== undefined
          ? { vvipPriceOverride: new Prisma.Decimal(exclusivePriceUsd) }
          : {}),
      },
    });
  } catch (err) {
    // P2002 = unique constraint violation — someone else already holds
    // this handle. A generic, honest 409 rather than exposing anything
    // about who.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json({ error: "That handle is already taken." }, { status: 409 });
    }
    throw err;
  }

  const pricing = await resolveCreatorPricing(updated);

  return NextResponse.json({
    effectiveVvipPriceUsd: pricing.vvipPriceUsd,
    unlimitedOptedIn: updated.unlimitedOptedIn,
    subscriberCountVisible: updated.subscriberCountVisible,
    locationVisible: updated.locationVisible,
    coverImageUrl: updated.coverImageUrl,
    handle: updated.handle,
  });
}
