import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { canAccessContent } from "@/lib/entitlements/content";
import { getMediaStorageProvider } from "@/lib/providers/storage";
import { selectDisplayPerPosition } from "@/lib/media/carousel";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The ONLY route that hands out a usable media URL. Enforces:
 *   User → Authorization → Content entitlement → Signed media access
 * per build brief §9. No other code path should construct or return a
 * storage URL — MediaAsset.storageKey never leaves the server otherwise.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { contentId: string } }
) {
  const user = await getCurrentUser();

  const content = await db.content.findUnique({
    where: { id: params.contentId },
    include: { mediaAssets: { orderBy: { position: "asc" } } },
  });
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  const entitlement = await canAccessContent(user, content);
  if (!entitlement.allowed) {
    // Deliberately generic — do not reveal whether it's a pricing,
    // ownership, or moderation reason, which could leak information about
    // unpublished/rejected content to an unauthorized caller.
    return NextResponse.json({ error: "You do not have access to this content." }, { status: 403 });
  }

  if (content.mediaAssets.length === 0) {
    return NextResponse.json({ error: "No media attached to this content." }, { status: 404 });
  }

  const storage = getMediaStorageProvider();
  // One entry per carousel slide (position), preferring each slide's
  // generated DISPLAY derivative (capped-dimension WebP, see
  // image-pipeline.ts) over its ORIGINAL when one exists — video/audio
  // slides and every piece of content uploaded before this pipeline
  // shipped have no DISPLAY asset, so they fall through to ORIGINAL
  // automatically. Sorted by position — carousel order is the response
  // array's own order, callers don't need to re-derive it.
  const chosenAssets = selectDisplayPerPosition(content.mediaAssets);
  const urls = await Promise.all(
    chosenAssets.map(async (asset: (typeof chosenAssets)[number]) => ({
      mediaAssetId: asset.id,
      mimeType: asset.mimeType,
      signedUrl: await storage.getSignedReadUrl(asset.storageKey),
      position: asset.position,
    }))
  );

  // Real view count, per direct request ("show views/impressions...
  // so creators know what performed best") — this route is the one
  // genuine "someone actually loaded this" choke point every media
  // fetch already passes through, so no new instrumentation call
  // sites are needed anywhere else. Excludes the content's own
  // creator (own_content) and an admin's own preview (admin_override)
  // — neither is a real audience view, and without this exclusion a
  // creator checking their own Content tab (which shows a thumbnail
  // preview per row — see ContentPanel) would inflate their own count
  // just by looking at it. Best-effort: a failure here should never
  // turn a successful media fetch into an error for the viewer.
  if (entitlement.reason !== "own_content" && entitlement.reason !== "admin_override") {
    try {
      await db.content.update({ where: { id: content.id }, data: { viewCount: { increment: 1 } } });
    } catch {
      // non-critical — the media response above is what actually matters
    }
  }

  return NextResponse.json({ contentId: content.id, reason: entitlement.reason, media: urls });
}
