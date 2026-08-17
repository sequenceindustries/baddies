import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

/**
 * Publishing is a creator action distinct from moderation approval — see
 * build brief §10. Content must already be APPROVED; this route only sets
 * `publishedAt`, which is the second half of the "isLive" check in
 * src/lib/entitlements/content.ts.
 */
export async function POST(
  req: NextRequest,
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

  if (content.status !== "APPROVED") {
    return NextResponse.json(
      { error: `Content must be APPROVED before publishing (currently "${content.status}").` },
      { status: 409 }
    );
  }

  if (content.publishedAt) {
    return NextResponse.json({ error: "Content is already published." }, { status: 409 });
  }

  const updated = await db.content.update({
    where: { id: content.id },
    data: { publishedAt: new Date() },
  });

  return NextResponse.json({ contentId: updated.id, publishedAt: updated.publishedAt });
}
