import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * A creator deleting their own content. This is a soft delete (status ->
 * REMOVED, publishedAt cleared) rather than a real row delete: Report and
 * ModerationCase both reference Content without ON DELETE CASCADE — on
 * purpose, so a trust & safety record survives even if the underlying
 * post is taken down — so a hard `db.content.delete()` would fail with a
 * foreign-key error on anything that was ever reported, and silently
 * destroy the audit trail on anything that wasn't.
 *
 * REMOVED + publishedAt: null is the same "not live" signal every public
 * query already filters on (status: "APPROVED", publishedAt: { not: null
 * }) and canAccessContent's isLive check — see entitlements/content.ts —
 * so a removed item disappears from every feed, grid, and direct-access
 * check immediately, with no other code path needing to know about the
 * new status value.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { contentId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const content = await db.content.findUnique({
    where: { id: params.contentId },
    include: { creatorProfile: { select: { userId: true } } },
  });
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  if (content.creatorProfile.userId !== user.id && user.role !== "ADMIN") {
    return NextResponse.json({ error: "You do not own this content." }, { status: 403 });
  }

  if (content.status === "REMOVED") {
    return NextResponse.json({ contentId: content.id, status: "REMOVED" });
  }

  const updated = await db.content.update({
    where: { id: content.id },
    data: { status: "REMOVED", publishedAt: null },
  });

  return NextResponse.json({ contentId: updated.id, status: updated.status });
}
