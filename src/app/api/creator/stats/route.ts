import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB + auth) and must never
// be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Self-service stats for the Dashboard's Overview tab — follower/
 * subscriber counts, content counts, and total likes across everything
 * this creator has posted. Deliberately separate from the public
 * GET /api/creators/:id route: that one only ever answers for a VERIFIED
 * creator and respects subscriberCountVisible/locationVisible (what a
 * *visitor* is allowed to see); this one is always the real numbers for
 * the creator looking at their own dashboard, regardless of status or
 * privacy toggles.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }

  const [followerCount, subscriberCount, publishedCount, totalCount, totalLikes] = await Promise.all([
    db.follow.count({ where: { creatorProfileId: creatorProfile.id } }),
    db.subscription.count({ where: { creatorProfileId: creatorProfile.id, status: "ACTIVE" } }),
    db.content.count({
      where: { creatorProfileId: creatorProfile.id, status: "APPROVED", publishedAt: { not: null } },
    }),
    db.content.count({ where: { creatorProfileId: creatorProfile.id, status: { not: "REMOVED" } } }),
    db.contentLike.count({ where: { content: { creatorProfileId: creatorProfile.id } } }),
  ]);

  return NextResponse.json({
    followerCount,
    subscriberCount,
    publishedCount,
    totalCount,
    totalLikes,
  });
}
