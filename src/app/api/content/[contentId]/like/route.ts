import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { canAccessContent } from "@/lib/entitlements/content";
import { createNotification } from "@/lib/creator-notifications/create-notification";

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

  // Swapped from an idempotent upsert to a plain create + P2002 catch
  // (same precedent as src/app/api/creator/settings/route.ts's handle
  // uniqueness check) so a repeat like/double-click can be told apart
  // from a genuinely new one — the notification below must fire exactly
  // once per real like, not once per POST.
  let isNewLike = true;
  try {
    await db.contentLike.create({ data: { fanId: user.id, contentId: content.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      isNewLike = false;
    } else {
      throw err;
    }
  }

  if (isNewLike) {
    // Best-effort notify — never lets a lookup/write failure here turn
    // an already-successful like into an error response for the fan.
    const creatorProfile = await db.creatorProfile.findUnique({
      where: { id: content.creatorProfileId },
      select: { userId: true },
    });
    if (creatorProfile && creatorProfile.userId !== user.id) {
      await createNotification({
        userId: creatorProfile.userId,
        type: "content.liked",
        payload: { actorUserId: user.id, contentId: content.id, creatorProfileId: content.creatorProfileId },
      });
    }
  }

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
