import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Creator-profile "..." menu Block action — the signed-in viewer
 * blocks the profile they're looking at (Block.blockerId = viewer,
 * blockedUserId = the creator's own User.id). Enforcement is checked
 * bidirectionally at the two places it matters (POST .../message,
 * POST .../follow), so it doesn't matter here which direction a past
 * block ran — either party blocking the other is enough going forward.
 *
 * Also removes any existing Follow row in the same request — an
 * active follow surviving a block would be inconsistent. No unblock
 * route/UI this pass — flagged as real follow-up work, not built here.
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
    return NextResponse.json({ error: "You cannot block your own creator profile." }, { status: 400 });
  }

  try {
    await db.block.create({ data: { blockerId: user.id, blockedUserId: creator.userId } });
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) {
      throw err;
    }
    // Already blocked — fall through, still a success from the
    // caller's point of view (idempotent, matching follow/like's own
    // upsert-like convention elsewhere in this codebase).
  }

  await db.follow.deleteMany({ where: { fanId: user.id, creatorProfileId: creator.id } });

  return NextResponse.json({ blocked: true });
}
