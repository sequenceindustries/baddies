import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 20;

/** "New Baddies" section (§11) — most recently verified creators. */
export async function GET() {
  const creators = await db.creatorProfile.findMany({
    where: { status: "VERIFIED" },
    orderBy: { approvedAt: "desc" },
    take: RESULT_LIMIT,
    select: CREATOR_CARD_SELECT,
  });

  const cards = await Promise.all(creators.map(toCreatorCard));
  // Performance audit: identical for every viewer (no auth/personalization
  // read at all) — the story row and the landing page's own row both
  // call this on every load. A short, safe cache window cuts real
  // repeat-request DB load without letting a newly-approved creator go
  // stale for long. force-dynamic above only disables build-time static
  // generation — it doesn't affect this runtime Cache-Control header.
  return NextResponse.json(
    { creators: cards },
    { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } }
  );
}
