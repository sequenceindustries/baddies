import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma, VerificationType } from "@prisma/client";
import { maybeAdvanceCreatorAfterVerification } from "@/lib/creator/verification-workflow";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const SESSION_TYPES: Record<"IDENTITY_AGE" | "LIVENESS", VerificationType[]> = {
  IDENTITY_AGE: ["IDENTITY", "AGE"],
  LIVENESS: ["LIVENESS"],
};

const ReviewSchema = z.object({
  kind: z.enum(["IDENTITY_AGE", "LIVENESS"]),
  decision: z.enum(["PASSED", "FAILED"]),
  failureReason: z.string().max(2000).optional(),
});

/**
 * Reviews one of the two self-captured evidence groups (see POST
 * /api/creator/verification/capture) — Identity+Age (details + ID
 * document from step 1, plus the live photo from step 2) or Liveness
 * (the recorded video from step 3). The two groups are submitted at
 * different times, so they're reviewed independently. Standard
 * admin-action template: resolve user → requirePermission → state
 * change → AuditLog, in one transaction.
 *
 * On PASSED, calls maybeAdvanceCreatorAfterVerification directly (rather
 * than going through applyVerificationOutcome, which keys off a
 * providerSessionId these self-capture sessions never have) so the
 * existing IDENTITY+AGE+LIVENESS-all-PASSED → UNDER_REVIEW auto-advance
 * logic stays the single source of truth — a no-op here until the other
 * group is PASSED too.
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

  const types = SESSION_TYPES[parsed.data.kind];
  const pendingSessions = await db.verificationSession.findMany({
    where: { creatorProfileId: creatorProfile.id, type: { in: types }, status: "MANUAL_REVIEW" },
  });
  if (pendingSessions.length === 0) {
    return NextResponse.json({ error: "No capture is awaiting review for this group." }, { status: 409 });
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.verificationSession.updateMany({
      where: { creatorProfileId: creatorProfile.id, type: { in: types }, status: "MANUAL_REVIEW" },
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
        metadata: { kind: parsed.data.kind, decision: parsed.data.decision, failureReason: parsed.data.failureReason },
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
