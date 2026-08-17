import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

/**
 * Content moderation queue (§10, §23). Deliberately returns caption and
 * classification metadata but leaves media retrieval to a separate,
 * explicitly-audited signed-URL step rather than embedding signed URLs
 * directly in a list response — keeps sensitive media access individually
 * accountable in the audit log.
 */
export async function GET(req: NextRequest) {
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

  const queue = await db.content.findMany({
    where: { status: "PENDING_REVIEW" },
    orderBy: { createdAt: "asc" },
    take: 50,
    select: {
      id: true,
      mediaType: true,
      accessLevel: true,
      caption: true,
      createdAt: true,
      creatorProfile: { select: { id: true, user: { select: { email: true } } } },
      participants: { select: { verificationParticipantId: true } },
    },
  });

  return NextResponse.json({
    queue: queue.map((item: (typeof queue)[number]) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: item.accessLevel,
      caption: item.caption,
      createdAt: item.createdAt,
      creatorProfileId: item.creatorProfile.id,
      creatorEmail: item.creatorProfile.user.email,
      participantCount: item.participants.length,
    })),
  });
}
