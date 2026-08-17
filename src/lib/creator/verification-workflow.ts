import { db } from "@/lib/db/client";
import { assertTransition } from "@/lib/creator/status";
import type { VerificationStatus } from "@prisma/client";

/**
 * Applies a verification outcome to its VerificationSession row, then
 * checks whether the owning creator has now cleared IDENTITY + AGE +
 * LIVENESS, advancing CreatorProfile from VERIFICATION_REQUIRED to
 * UNDER_REVIEW (awaiting admin approval — see build brief §6: admin
 * approval is always a separate, final step; automated checks alone never
 * grant VERIFIED status).
 */
export async function applyVerificationOutcome(params: {
  providerSessionId: string;
  status: VerificationStatus;
  providerReference?: string;
  failureReason?: string;
}): Promise<void> {
  const session = await db.verificationSession.findFirst({
    where: { providerSessionId: params.providerSessionId },
  });
  if (!session) {
    console.warn(
      `[verification] webhook referenced unknown providerSessionId "${params.providerSessionId}"`
    );
    return;
  }

  await db.verificationSession.update({
    where: { id: session.id },
    data: {
      status: params.status,
      providerReference: params.providerReference,
      failureReason: params.failureReason,
      completedAt: ["PASSED", "FAILED", "EXPIRED"].includes(params.status) ? new Date() : undefined,
    },
  });

  if (session.creatorProfileId) {
    await maybeAdvanceCreatorAfterVerification(session.creatorProfileId);
  }
  // VerificationParticipant outcomes are applied to their own record but do
  // not drive creator status transitions — see
  // src/lib/creator/participants.ts (Sprint 1 collaborative-content work).
}

async function maybeAdvanceCreatorAfterVerification(creatorProfileId: string): Promise<void> {
  const creatorProfile = await db.creatorProfile.findUnique({
    where: { id: creatorProfileId },
  });
  if (!creatorProfile || creatorProfile.status !== "VERIFICATION_REQUIRED") return;

  const sessions = await db.verificationSession.findMany({
    where: { creatorProfileId },
  });

  const requiredTypes = ["IDENTITY", "AGE", "LIVENESS"] as const;
  const allPassed = requiredTypes.every((type) =>
    sessions.some((s: (typeof sessions)[number]) => s.type === type && s.status === "PASSED")
  );

  if (!allPassed) return;

  assertTransition(creatorProfile.status, "UNDER_REVIEW");

  await db.$transaction([
    db.creatorProfile.update({
      where: { id: creatorProfileId },
      data: { status: "UNDER_REVIEW" },
    }),
    db.auditLog.create({
      data: {
        action: "creator.verification.completed",
        targetType: "creator_profile",
        targetId: creatorProfileId,
        metadata: { note: "Identity, age, and liveness checks all passed; awaiting admin compliance review." },
      },
    }),
  ]);
}
