import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "./creator-card";

/**
 * Shared by /api/home and /api/discovery/nearby-creators — "Baddies Near
 * You" is the same query either place it appears, so it lives here once
 * instead of being copied.
 */
export async function getFanCountry(fanId?: string): Promise<string | null> {
  if (!fanId) return null;
  const profile = await db.profile.findUnique({ where: { userId: fanId }, select: { country: true } });
  return profile?.country ?? null;
}

/** Same real, detected country as the fan's own (see LocationField/useLocationDetector) — never a self-reported one. */
export async function getNearbyCreators(fanCountry: string | null, excludeCreatorIds: Set<string> = new Set()) {
  if (!fanCountry) return [];
  const creators = await db.creatorProfile.findMany({
    where: {
      status: "VERIFIED",
      locationVisible: true,
      id: { notIn: Array.from(excludeCreatorIds) },
      user: { profile: { country: fanCountry } },
    },
    orderBy: { approvedAt: "desc" },
    take: 10,
    select: CREATOR_CARD_SELECT,
  });
  return Promise.all(creators.map(toCreatorCard));
}
