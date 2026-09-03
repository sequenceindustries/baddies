import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route writes live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  status: z.enum([
    "APPLIED",
    "REVIEWED",
    "APPROVED",
    "VERIFICATION_PENDING",
    "VERIFIED",
    "ONBOARDING",
    "CONTENT_READY",
    "LIVE",
    "REJECTED",
  ]),
  adminNotes: z.string().max(4000).nullable().optional(),
});

/**
 * Moves a Founding Baddies application through its pipeline (see
 * FoundingApplicationStatus). One generic status-update endpoint rather
 * than a separate route per transition (approve/reject/etc.) — there
 * are 8 statuses here, not just two, so a fixed "next status" picker in
 * the admin UI is a better fit than the binary approve/reject pattern
 * the CreatorProfile queue uses.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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

  const json = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.foundingApplication.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const updated = await db.foundingApplication.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status,
      adminNotes: parsed.data.adminNotes,
      reviewedBy: user.id,
      reviewedAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "founding_application.status_change",
      targetType: "founding_application",
      targetId: updated.id,
      metadata: { from: existing.status, to: updated.status },
    },
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
