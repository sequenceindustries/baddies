import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/** The Content Library detail view's one call. Same permission as the
 * queue/library list (content:moderate) — this is still moderation
 * data, just for one item instead of a page of them. */
export async function GET(_req: Request, { params }: { params: { contentId: string } }) {
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
      creatorProfile: { select: { id: true, user: { select: { email: true }, }, } },
      participants: { select: { verificationParticipantId: true } },
      _count: { select: { likes: true, purchases: true } },
    },
  });
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  const [moderationHistory, reports] = await Promise.all([
    db.auditLog.findMany({
      where: { targetType: "content", targetId: content.id },
      orderBy: { createdAt: "desc" },
      include: { actor: { select: { email: true } } },
    }),
    db.report.findMany({ where: { contentId: content.id }, orderBy: { createdAt: "desc" } }),
  ]);

  return NextResponse.json({
    contentId: content.id,
    mediaType: content.mediaType,
    accessLevel: content.accessLevel,
    priceUsd: content.priceUsd?.toString() ?? null,
    caption: content.caption,
    status: content.status,
    moderationStatus: content.moderationStatus,
    contentHash: content.contentHash,
    publishedAt: content.publishedAt,
    createdAt: content.createdAt,
    creatorProfileId: content.creatorProfile.id,
    creatorEmail: content.creatorProfile.user.email,
    participantCount: content.participants.length,
    likeCount: content._count.likes,
    purchaseCount: content._count.purchases,
    moderationHistory: moderationHistory.map((a) => ({
      id: a.id,
      action: a.action,
      actorEmail: a.actor?.email ?? "system",
      metadata: a.metadata,
      createdAt: a.createdAt,
    })),
    reports: reports.map((r) => ({ id: r.id, reason: r.reason, details: r.details, createdAt: r.createdAt })),
  });
}
