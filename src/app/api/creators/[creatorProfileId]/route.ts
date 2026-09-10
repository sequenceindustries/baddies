import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Public creator profile (§12). Only exposes a VERIFIED creator's profile
 * — anything else 404s rather than leaking existence/status of a pending
 * or rejected application to the public. Privacy toggles
 * (subscriberCountVisible, locationVisible) are respected here, not left
 * to the frontend to hide. followerCount is always shown (Fansly-style
 * social proof, lower-stakes than the paid subscriber count).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
  const creator = await db.creatorProfile.findUnique({
    where: { id: params.creatorProfileId },
    include: { user: { include: { profile: true, foundingPartner: true } } },
  });

  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  const pricing = await resolveCreatorPricing(creator);

  const [followerCount, followingCount, subscriberCount, avatarUrl, coverImageUrl] = await Promise.all([
    db.follow.count({ where: { creatorProfileId: creator.id } }),
    // This creator's own User.id can already be the fanId side of a
    // Follow row — nothing in the schema restricts fanId to FAN-role
    // users (confirmed live: creators can already follow other
    // creators today) — so this is a real count, not a new concept.
    db.follow.count({ where: { fanId: creator.userId } }),
    creator.subscriberCountVisible
      ? db.subscription.count({ where: { creatorProfileId: creator.id, status: "ACTIVE" } })
      : Promise.resolve(undefined),
    resolveDisplayUrl(creator.user.profile?.avatarUrl),
    resolveDisplayUrl(creator.coverImageUrl),
  ]);

  return NextResponse.json({
    creatorProfileId: creator.id,
    userId: creator.userId,
    displayName: creator.user.profile?.displayName,
    handle: creator.handle,
    bio: creator.user.profile?.bio,
    avatarUrl,
    coverImageUrl,
    country: creator.locationVisible ? creator.user.profile?.country : undefined,
    city: creator.locationVisible ? creator.user.profile?.city : undefined,
    verifiedBadge: true, // this route only ever returns VERIFIED creators
    vvipPriceUsd: pricing.vvipPriceUsd,
    unlimitedParticipant: creator.unlimitedOptedIn,
    acceptsMessages: creator.acceptsMessages,
    followerCount,
    followingCount,
    subscriberCount,
    isFoundingPartner: creator.user.foundingPartner !== null,
    isFoundingBaddie: creator.isFoundingBaddie,
  });
}
