import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { computeTrendingContent } from "@/lib/discovery/trending";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

export async function GET() {
  const ranked = await computeTrendingContent();
  if (ranked.length === 0) {
    return NextResponse.json({ items: [] });
  }

  const contentIds = ranked.map((r) => r.contentId);
  const content = await db.content.findMany({
    where: {
      id: { in: contentIds },
      status: "APPROVED",
      publishedAt: { not: null },
      accessLevel: { in: ["FREE", "VIP"] }, // don't surface VVIP previews without a subscription
    },
    select: {
      id: true,
      mediaType: true,
      accessLevel: true,
      caption: true,
      publishedAt: true,
      creatorProfile: {
        select: {
          id: true,
          user: { select: { profile: { select: { displayName: true, avatarUrl: true } } } },
        },
      },
    },
  });

  const byId = new Map<string, (typeof content)[number]>(
    content.map((c: (typeof content)[number]) => [c.id, c])
  );
  const ordered = ranked
    .map((r) => byId.get(r.contentId))
    .filter((c): c is (typeof content)[number] => Boolean(c));

  return NextResponse.json({
    items: ordered.map((item) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: item.accessLevel,
      caption: item.caption,
      publishedAt: item.publishedAt,
      creator: {
        creatorProfileId: item.creatorProfile.id,
        displayName: item.creatorProfile.user.profile?.displayName,
        avatarUrl: item.creatorProfile.user.profile?.avatarUrl,
      },
    })),
  });
}
