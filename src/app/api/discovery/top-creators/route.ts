import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 10;

/**
 * "Top Baddies" — the landing page's pre-login highlight row. Ranked by
 * follower count, the one popularity signal that's always public (see
 * creator-card.ts's followerCount, and the privacy-gated subscriberCount
 * it's deliberately distinct from) — safe to rank on for a visitor who
 * isn't signed in yet and has no personalized signal to rank by instead.
 */
export async function GET() {
  const creators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED" },
    orderBy: { followers: { _count: "desc" } },
    take: RESULT_LIMIT,
    select: CREATOR_CARD_SELECT,
  });

  const cards = await Promise.all(creators.map(toCreatorCard));
  return NextResponse.json({ creators: cards });
}
