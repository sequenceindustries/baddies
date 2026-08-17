import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { assertContentTransition, InvalidContentTransitionError } from "@/lib/content/status";

/**
 * Approves content out of PENDING_REVIEW. Per build brief §7, a creator
 * uploading a collaborator does not by itself establish consent — so if
 * this content has any ContentParticipant records, every one of them must
 * have a PASSED verification AND a CONFIRMED consent record before an
 * admin can approve. This is a hard gate, not a warning.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { contentId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "content:moderate");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const content = await db.content.findUnique({
    where: { id: params.contentId },
    include: {
      participants: {
        include: {
          verificationParticipant: {
            include: { consentRecords: true, verifications: true },
          },
        },
      },
    },
  });
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  try {
    assertContentTransition(content.status, "APPROVED");
  } catch (err) {
    if (err instanceof InvalidContentTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  for (const participantLink of content.participants) {
    const vp = participantLink.verificationParticipant;
    const verified = vp.verifications.some((v: (typeof vp.verifications)[number]) => v.status === "PASSED");
    const consented = vp.consentRecords.some((c: (typeof vp.consentRecords)[number]) => c.status === "CONFIRMED");
    if (!verified || !consented) {
      return NextResponse.json(
        {
          error:
            "Cannot approve: at least one content participant is missing verified identity and/or confirmed consent.",
          verificationParticipantId: vp.id,
        },
        { status: 409 }
      );
    }
  }

  const updated = await db.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
    const result = await tx.content.update({
      where: { id: content.id },
      data: { status: "APPROVED", moderationStatus: "APPROVED" },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "content.approve",
        targetType: "content",
        targetId: content.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return result;
  });

  return NextResponse.json({ contentId: updated.id, status: updated.status });
}
