import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { assertTransition, InvalidTransitionError } from "@/lib/creator/status";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Approves a creator application, transitioning CreatorProfile.status to
 * VERIFIED. This is a template for every admin action in the app:
 *   1. resolve current user
 *   2. requirePermission() — server-side, never trust a client-sent role
 *   3. perform the state change
 *   4. write an AuditLog row (build brief §23: "Every sensitive admin
 *      action should be logged.")
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "creator:verify");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { id: params.creatorProfileId },
  });
  if (!creatorProfile) {
    return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
  }

  // Guards against re-approving an already-suspended/banned creator, or
  // skipping the verification steps, via a stale/replayed request.
  try {
    assertTransition(creatorProfile.status, "VERIFIED");
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: { status: "VERIFIED", approvedAt: new Date(), approvedBy: user.id },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "creator.approve",
        targetType: "creator_profile",
        targetId: creatorProfile.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return result;
  });

  return NextResponse.json({ creatorProfileId: updated.id, status: updated.status });
}
