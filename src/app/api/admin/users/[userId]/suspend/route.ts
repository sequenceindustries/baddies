import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { assertTransition, InvalidTransitionError } from "@/lib/creator/status";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Suspends a user account (isActive = false, which getCurrentUser already
 * treats as "no session" — see src/lib/auth/current-user.ts). Reversible:
 * an admin can reactivate by setting isActive back to true directly (no
 * dedicated "unsuspend" route yet). If the user is a VERIFIED creator,
 * also moves CreatorProfile.status to SUSPENDED through the existing
 * state machine rather than writing the enum value directly.
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
    requirePermission(admin.role, "user:suspend");
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
    return NextResponse.json({ error: "Cannot suspend an admin account." }, { status: 400 });
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { isActive: false, suspendedAt: new Date() } });

      if (target.creatorProfile && target.creatorProfile.status === "VERIFIED") {
        assertTransition(target.creatorProfile.status, "SUSPENDED");
        await tx.creatorProfile.update({ where: { id: target.creatorProfile.id }, data: { status: "SUSPENDED" } });
      }

      await tx.auditLog.create({
        data: {
          actorId: admin.id,
          action: "user.suspend",
          targetType: "user",
          targetId: target.id,
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    });
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  return NextResponse.json({ userId: target.id, isActive: false });
}
