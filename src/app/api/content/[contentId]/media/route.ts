import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { canAccessContent } from "@/lib/entitlements/content";
import { getMediaStorageProvider } from "@/lib/providers/storage";

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
    include: { mediaAssets: true },
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
  const urls = await Promise.all(
    content.mediaAssets.map(async (asset: (typeof content.mediaAssets)[number]) => ({
      mediaAssetId: asset.id,
      mimeType: asset.mimeType,
      signedUrl: await storage.getSignedReadUrl(asset.storageKey),
    }))
  );

  return NextResponse.json({ contentId: content.id, reason: entitlement.reason, media: urls });
}
