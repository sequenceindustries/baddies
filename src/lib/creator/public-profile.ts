import { db } from "@/lib/db/client";
import { resolveCreatorPricing } from "@/lib/creator/pricing";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Mirrors HANDLE_REGEX in src/app/api/creator/settings/route.ts (the
// source of truth for what a creator can actually set as a handle) —
// duplicated here as a small, local format check rather than importing
// a non-route export from that route module, matching this codebase's
// own established "small self-contained duplication" precedent (e.g.
// CreatorOptionsMenu duplicating PostOptionsMenu's shape). Only used
// below to decide whether an incoming URL segment should be looked up
// as a handle or a raw id — never used to validate/write a handle.
// Collision-safe by construction: every Prisma id is a cuid (25 chars,
// always starting with "c"), always longer than this 20-char cap.
const HANDLE_FORMAT = /^[a-z0-9_]{3,20}$/;

export interface PublicCreatorProfile {
  creatorProfileId: string;
  userId: string;
  displayName: string | null;
  handle: string | null;
  bio: string | null;
  avatarUrl: string | null;
  coverImageUrl: string | null;
  country: string | null;
  city: string | null;
  verifiedBadge: true;
  vvipPriceUsd: number;
  unlimitedParticipant: boolean;
  acceptsMessages: boolean;
  followerCount: number;
  followingCount: number;
  subscriberCount?: number;
  isFoundingPartner: boolean;
  isFoundingBaddie: boolean;
  updatedAt: Date;
}

/**
 * The single source of truth for a creator's public-safe profile shell
 * — extracted from GET /api/creators/[creatorProfileId] (which now
 * delegates here unchanged) so the exact same logic backs both that
 * JSON API and the server-rendered profile page (src/app/creators/
 * [creatorProfileId]/page.tsx), rather than the page re-fetching its
 * own data over HTTP from itself.
 *
 * Resolves by EITHER a raw cuid id OR a creator's chosen handle (see
 * HANDLE_FORMAT above for why this is unambiguous) — this is what lets
 * a creator who sets a handle get a clean, human-readable URL
 * (/creators/zoe) that resolves identically to their existing cuid URL
 * (/creators/cmt...), with no migration and no redirect.
 *
 * Returns null (never throws, never distinguishes the reason) for
 * anything that shouldn't be publicly visible — a non-existent id/
 * handle, or a real creator who isn't VERIFIED yet — so callers can
 * 404 without ever leaking whether a given id/handle belongs to a
 * pending or rejected application. Privacy toggles
 * (subscriberCountVisible, locationVisible) are respected here, not
 * left to any caller to hide.
 */
export async function getPublicCreatorProfile(idOrHandle: string): Promise<PublicCreatorProfile | null> {
  const creator = await db.creatorProfile.findUnique({
    where: HANDLE_FORMAT.test(idOrHandle) ? { handle: idOrHandle } : { id: idOrHandle },
    include: { user: { include: { profile: true, foundingPartner: true } } },
  });

  if (!creator || creator.status !== "VERIFIED") {
    return null;
  }

  const pricing = await resolveCreatorPricing(creator);

  const [followerCount, followingCount, subscriberCount, avatarUrl, coverImageUrl] = await Promise.all([
    db.follow.count({ where: { creatorProfileId: creator.id } }),
    // This creator's own User.id can already be the fanId side of a
    // Follow row — nothing in the schema restricts fanId to FAN-role
    // users (creators can already follow other creators) — so this is
    // a real count, not a new concept.
    db.follow.count({ where: { fanId: creator.userId } }),
    creator.subscriberCountVisible
      ? db.subscription.count({ where: { creatorProfileId: creator.id, status: "ACTIVE" } })
      : Promise.resolve(undefined),
    resolveDisplayUrl(creator.user.profile?.avatarUrl),
    resolveDisplayUrl(creator.coverImageUrl),
  ]);

  return {
    creatorProfileId: creator.id,
    userId: creator.userId,
    displayName: creator.user.profile?.displayName ?? null,
    handle: creator.handle,
    bio: creator.user.profile?.bio ?? null,
    avatarUrl: avatarUrl ?? null,
    coverImageUrl: coverImageUrl ?? null,
    country: creator.locationVisible ? (creator.user.profile?.country ?? null) : null,
    city: creator.locationVisible ? (creator.user.profile?.city ?? null) : null,
    verifiedBadge: true, // this function only ever returns VERIFIED creators
    vvipPriceUsd: pricing.vvipPriceUsd,
    unlimitedParticipant: creator.unlimitedOptedIn,
    acceptsMessages: creator.acceptsMessages,
    followerCount,
    followingCount,
    subscriberCount,
    isFoundingPartner: creator.user.foundingPartner !== null,
    isFoundingBaddie: creator.isFoundingBaddie,
    updatedAt: creator.updatedAt,
  };
}

/**
 * `/creators/{handle}` when the creator has one, else `/creators/
 * {creatorProfileId}` — the preferred, canonical public URL for a
 * creator. Both forms always resolve (see getPublicCreatorProfile
 * above) so this is purely a "which one to point search engines and
 * share links at" choice, never a redirect target — a creator without
 * a handle keeps a perfectly valid cuid URL, and setting a handle
 * later doesn't break anything already linking to the old one.
 */
export function resolveCreatorCanonicalPath(
  creator: Pick<PublicCreatorProfile, "creatorProfileId" | "handle">
): string {
  return `/creators/${creator.handle ?? creator.creatorProfileId}`;
}
