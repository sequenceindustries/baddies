import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { maybeAdvanceCreatorAfterVerification } from "@/lib/creator/verification-workflow";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const ReviewSchema = z.object({
  decision: z.enum(["PASSED", "FAILED"]),
  failureReason: z.string().max(2000).optional(),
});

/**
 * Reviews a creator's self-captured "selfie holding ID" evidence (see
 * POST /api/creator/verification/capture) — the one admin action that
 * makes MANUAL_REVIEW sessions ever move. Standard admin-action template:
 * resolve user → requirePermission → state change → AuditLog, in one
 * transaction.
 *
 * On PASSED, calls maybeAdvanceCreatorAfterVerification directly (rather
 * than going through applyVerificationOutcome, which keys off a
 * providerSessionId these self-capture sessions never have) so the
 * existing IDENTITY+AGE+LIVENESS-all-PASSED → UNDER_REVIEW auto-advance
 * logic stays the single source of truth.
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

  const json = await req.json().catch(() => null);
  const parsed = ReviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { id: params.creatorProfileId },
  });
  if (!creatorProfile) {
    return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
  }

  const pendingSessions = await db.verificationSession.findMany({
    where: { creatorProfileId: creatorProfile.id, status: "MANUAL_REVIEW" },
  });
  if (pendingSessions.length === 0) {
    return NextResponse.json({ error: "No capture is awaiting review for this creator." }, { status: 409 });
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.verificationSession.updateMany({
      where: { creatorProfileId: creatorProfile.id, status: "MANUAL_REVIEW" },
      data: {
        status: parsed.data.decision,
        completedAt: new Date(),
        failureReason: parsed.data.decision === "FAILED" ? parsed.data.failureReason ?? null : null,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "creator.verification.reviewed",
        targetType: "creator_profile",
        targetId: creatorProfile.id,
        metadata: { decision: parsed.data.decision, failureReason: parsed.data.failureReason },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
  });

  if (parsed.data.decision === "PASSED") {
    await maybeAdvanceCreatorAfterVerification(creatorProfile.id);
  }

  const updated = await db.creatorProfile.findUniqueOrThrow({ where: { id: creatorProfile.id } });
  return NextResponse.json({ creatorProfileId: updated.id, status: updated.status });
}
