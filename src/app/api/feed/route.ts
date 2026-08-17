import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";

const PAGE_SIZE = 20;

/**
 * Sprint 2 feed: a simple reverse-chronological stream of published,
 * approved PUBLIC_PREVIEW/ENTRY content from VERIFIED creators. This is
 * intentionally basic — per build brief §13 ("Avoid turning the MVP into
 * an overly complicated social network") and §35 ("Do not overbuild").
 *
 * Personalized sections (Following, Recommended, Trending, category
 * filters — §11, §13) are Sprint 3 (Discovery) work and depend on models
 * this schema doesn't have yet (e.g. a Follow relation). This endpoint is
 * the foundation those will layer on top of, not a replacement for them.
 */
export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

  const items = await db.content.findMany({
    where: {
      status: "APPROVED",
      publishedAt: { not: null },
      accessLevel: { in: ["PUBLIC_PREVIEW", "ENTRY"] },
      creatorProfile: { status: "VERIFIED" },
    },
    orderBy: { publishedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      mediaType: true,
      accessLevel: true,
      caption: true,
      publishedAt: true,
      creatorProfile: {
        select: {
          id: true,
          locationVisible: true,
          user: { select: { profile: { select: { displayName: true, avatarUrl: true, country: true } } } },
        },
      },
    },
  });

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;

  return NextResponse.json({
    items: page.map((item: (typeof page)[number]) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: item.accessLevel,
      caption: item.caption,
      publishedAt: item.publishedAt,
      creator: {
        creatorProfileId: item.creatorProfile.id,
        displayName: item.creatorProfile.user.profile?.displayName,
        avatarUrl: item.creatorProfile.user.profile?.avatarUrl,
        country: item.creatorProfile.locationVisible
          ? item.creatorProfile.user.profile?.country
          : undefined,
        verifiedBadge: true,
      },
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
