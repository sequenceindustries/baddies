import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * One creator's currently-active stories, oldest-first (Instagram
 * convention — a viewer sees the full 24h arc in the order it was
 * actually posted). Any signed-in viewer, zero entitlement check of any
 * kind — matches GET /api/stories's "not gated by tier" contract.
 * Prefers each story's DISPLAY/WebP derivative over the original,
 * mirroring GET /api/content/[contentId]/media's exact kind-preference
 * logic.
 */
export async function GET(_req: NextRequest, { params }: { params: { creatorProfileId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const stories = await db.story.findMany({
    where: { creatorProfileId: params.creatorProfileId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
  });

  const storage = getMediaStorageProvider();
  const items = await Promise.all(
    stories.map(async (s: (typeof stories)[number]) => ({
      storyId: s.id,
      mediaType: s.mediaType,
      mimeType: s.displayStorageKey ? (s.displayMimeType ?? s.mimeType) : s.mimeType,
      signedUrl: await storage.getSignedReadUrl(s.displayStorageKey ?? s.storageKey),
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }))
  );

  return NextResponse.json({ items });
}
