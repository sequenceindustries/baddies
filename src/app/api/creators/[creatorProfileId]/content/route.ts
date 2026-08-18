import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * A creator's own feed. Returns classification metadata (§8) so the
 * client can render locked/unlocked states correctly, but never a media
 * URL — clients fetch that per-item from
 * /api/content/:id/media once the fan has confirmed intent to view,
 * which is where the real entitlement check happens.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
  const creator = await db.creatorProfile.findUnique({ where: { id: params.creatorProfileId } });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

  const items = await db.content.findMany({
    where: { creatorProfileId: creator.id, status: "APPROVED", publishedAt: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      mediaType: true,
      accessLevel: true,
      priceUsd: true,
      caption: true,
      publishedAt: true,
    },
  });

  const hasMore = items.length > PAGE_SIZE;
  const page = hasMore ? items.slice(0, PAGE_SIZE) : items;

  return NextResponse.json({
    items: page.map((item: (typeof page)[number]) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: item.accessLevel,
      priceUsd: item.priceUsd,
      caption: item.caption,
      publishedAt: item.publishedAt,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
