import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

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

  await db.follow.upsert({
    where: { fanId_creatorProfileId: { fanId: user.id, creatorProfileId: creator.id } },
    create: { fanId: user.id, creatorProfileId: creator.id },
    update: {},
  });

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
