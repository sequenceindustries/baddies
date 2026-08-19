import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 8;

/**
 * Landing-page-only feed: the most recently published FREE content across
 * every verified creator. Deliberately FREE-only (unlike
 * /api/discovery/trending, which also allows VIP) — this is an anonymous
 * visitor's very first look at the platform, before they've signed up for
 * anything, so nothing shown here should require an account to actually
 * open.
 */
export async function GET() {
  const items = await db.content.findMany({
    where: { status: "APPROVED", publishedAt: { not: null }, accessLevel: "FREE" },
    orderBy: { publishedAt: "desc" },
    take: RESULT_LIMIT,
    select: {
      id: true,
      mediaType: true,
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

  return NextResponse.json({
    items: items.map((item: (typeof items)[number]) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: "FREE" as const,
      caption: item.caption,
      publishedAt: item.publishedAt,
      creatorProfileId: item.creatorProfile.id,
      creatorDisplayName: item.creatorProfile.user.profile?.displayName ?? null,
      creatorAvatarUrl: item.creatorProfile.user.profile?.avatarUrl ?? null,
    })),
  });
}
