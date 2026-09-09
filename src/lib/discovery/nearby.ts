import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "./creator-card";

/**
 * Backs /api/discovery/nearby-creators's "Baddies Near You" section.
 * (Previously also shared by the now-removed /api/home — see
 * GET /api/feed's own comment on why the fan-home feed was rewired to
 * a single blended stream instead.)
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
