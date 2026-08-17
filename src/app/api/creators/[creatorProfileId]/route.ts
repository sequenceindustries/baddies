import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { resolveCreatorPricing } from "@/lib/creator/pricing";

/**
 * Public creator profile (§12). Only exposes a VERIFIED creator's profile
 * — anything else 404s rather than leaking existence/status of a pending
 * or rejected application to the public. Privacy toggles
 * (subscriberCountVisible, locationVisible) are respected here, not left
 * to the frontend to hide.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
  const creator = await db.creatorProfile.findUnique({
    where: { id: params.creatorProfileId },
    include: { user: { include: { profile: true } } },
  });

  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  const pricing = await resolveCreatorPricing(creator);

  let subscriberCount: number | undefined;
  if (creator.subscriberCountVisible) {
    subscriberCount = await db.subscription.count({
      where: { creatorProfileId: creator.id, status: "ACTIVE" },
    });
  }

  return NextResponse.json({
    creatorProfileId: creator.id,
    displayName: creator.user.profile?.displayName,
    bio: creator.user.profile?.bio,
    avatarUrl: creator.user.profile?.avatarUrl,
    coverImageUrl: creator.coverImageUrl,
    country: creator.locationVisible ? creator.user.profile?.country : undefined,
    verifiedBadge: true, // this route only ever returns VERIFIED creators
    entryPriceUsd: pricing.entryPriceUsd,
    vipPriceUsd: pricing.vipPriceUsd,
    unlimitedParticipant: creator.unlimitedOptedIn,
    subscriberCount,
  });
}
