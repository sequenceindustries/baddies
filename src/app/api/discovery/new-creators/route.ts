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
  return NextResponse.json({ creators: cards });
}
