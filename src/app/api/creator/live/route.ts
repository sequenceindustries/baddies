import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { canMonetise } from "@/lib/creator/status";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Toggles CreatorProfile.isLive — see its comment in schema.prisma for
 * why this is a status flag and not a real video stream.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }
  if (!canMonetise(creatorProfile.status)) {
    return NextResponse.json({ error: "Only verified creators can go live." }, { status: 403 });
  }

  const updated = await db.creatorProfile.update({
    where: { id: creatorProfile.id },
    data: { isLive: true, liveStartedAt: new Date() },
  });

  return NextResponse.json({ isLive: updated.isLive, liveStartedAt: updated.liveStartedAt });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }

  const updated = await db.creatorProfile.update({
    where: { id: creatorProfile.id },
    data: { isLive: false, liveStartedAt: null },
  });

  return NextResponse.json({ isLive: updated.isLive });
}
