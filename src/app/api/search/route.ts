import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 20;

/**
 * Basic search (§11: implied by "Discovery"). Postgres ILIKE against
 * display name / bio for creators. No dedicated search infra (Elasticsearch
 * etc.) for MVP — build brief §31/§35 push toward the simplest thing that
 * works; revisit if/when result quality or scale demands it.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ error: "Query parameter 'q' must be at least 2 characters." }, { status: 400 });
  }

  const creators = await db.creatorProfile.findMany({
    where: {
      status: "VERIFIED",
      user: {
        profile: {
          OR: [
            { displayName: { contains: q, mode: "insensitive" } },
            { bio: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    },
    take: RESULT_LIMIT,
    select: CREATOR_CARD_SELECT,
  });

  const cards = await Promise.all(creators.map(toCreatorCard));

  return NextResponse.json({ creators: cards });
}
