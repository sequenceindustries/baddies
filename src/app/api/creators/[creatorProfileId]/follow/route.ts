import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { createNotification } from "@/lib/creator-notifications/create-notification";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Follow a creator (§4: "FAN can... Follow" is implied by the Fan Home /
 * discovery sections in §11 and §13). No RBAC permission needed beyond
 * "is an authenticated fan" — following is a low-stakes, reversible
 * action, unlike the payment/moderation actions that go through
 * requirePermission().
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creator = await db.creatorProfile.findUnique({ where: { id: params.creatorProfileId } });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  if (creator.userId === user.id) {
    return NextResponse.json({ error: "You cannot follow your own creator profile." }, { status: 400 });
  }

  // Either party blocking the other rules out following — a fan who
  // blocked this creator (or was blocked by them) shouldn't be able to
  // follow them, same as a blocked pair can't message each other.
  const blocked = await db.block.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedUserId: creator.userId },
        { blockerId: creator.userId, blockedUserId: user.id },
      ],
    },
    select: { id: true },
  });
  if (blocked) {
    return NextResponse.json({ error: "You can't follow this creator." }, { status: 403 });
  }

  // Swapped from an idempotent upsert to a plain create + P2002 catch
  // (same precedent as src/app/api/creator/settings/route.ts's handle
  // uniqueness check) so a repeat follow can be told apart from a
  // genuinely new one — the notification below must fire exactly once
  // per real follow, not once per POST. Self-follow is already blocked
  // above, so no extra actor check is needed before notifying.
  let isNewFollow = true;
  try {
    await db.follow.create({ data: { fanId: user.id, creatorProfileId: creator.id } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      isNewFollow = false;
    } else {
      throw err;
    }
  }

  if (isNewFollow) {
    await createNotification({
      userId: creator.userId,
      type: "creator.followed",
      payload: { actorUserId: user.id, creatorProfileId: creator.id },
    });
  }

  return NextResponse.json({ following: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  await db.follow.deleteMany({
    where: { fanId: user.id, creatorProfileId: params.creatorProfileId },
  });

  return NextResponse.json({ following: false });
}
