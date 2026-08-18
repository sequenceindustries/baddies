import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { canTransition } from "@/lib/creator/status";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Bans a user account — the terminal, non-reversible-by-this-app action
 * (see BANNED's empty transition list in src/lib/creator/status.ts: "no
 * route back"). The User model itself has no separate banned flag from
 * suspended (both are isActive = false); "ban" is distinguished by the
 * audit log action and, for creators, the CreatorStatus transition to the
 * BANNED terminal state where the schema does support it (from VERIFIED
 * or SUSPENDED only — canTransition silently no-ops otherwise rather than
 * failing the whole request, since banning the account itself is the
 * primary action here).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { userId: string } }
) {
  const admin = await getCurrentUser();
  if (!admin) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(admin.role, "user:ban");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const target = await db.user.findUnique({ where: { id: params.userId }, include: { creatorProfile: true } });
  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.role === "ADMIN") {
    return NextResponse.json({ error: "Cannot ban an admin account." }, { status: 400 });
  }

  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: target.id }, data: { isActive: false, suspendedAt: new Date() } });

    if (target.creatorProfile && canTransition(target.creatorProfile.status, "BANNED")) {
      await tx.creatorProfile.update({ where: { id: target.creatorProfile.id }, data: { status: "BANNED" } });
    }

    await tx.auditLog.create({
      data: {
        actorId: admin.id,
        action: "user.ban",
        targetType: "user",
        targetId: target.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
  });

  return NextResponse.json({ userId: target.id, isActive: false });
}
