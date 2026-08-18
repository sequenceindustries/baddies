import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { canAccessContent } from "@/lib/entitlements/content";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Like/unlike a piece of content — social-proof signal only (Fansly-style
 * likes/followers), grants no access on its own. A fan must actually be
 * entitled to VIEW the content to like it — routed through the same
 * canAccessContent() check every media-serving path uses, so liking
 * can't be used to probe which locked content exists.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { contentId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const content = await db.content.findUnique({ where: { id: params.contentId } });
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  const entitlement = await canAccessContent(user, content);
  if (!entitlement.allowed) {
    return NextResponse.json({ error: "You do not have access to this content." }, { status: 403 });
  }

  await db.contentLike.upsert({
    where: { fanId_contentId: { fanId: user.id, contentId: content.id } },
    create: { fanId: user.id, contentId: content.id },
    update: {},
  });

  const likeCount = await db.contentLike.count({ where: { contentId: content.id } });
  return NextResponse.json({ liked: true, likeCount });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { contentId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  await db.contentLike.deleteMany({ where: { fanId: user.id, contentId: params.contentId } });

  const likeCount = await db.contentLike.count({ where: { contentId: params.contentId } });
  return NextResponse.json({ liked: false, likeCount });
}
