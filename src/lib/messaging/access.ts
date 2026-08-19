import { db } from "@/lib/db/client";
import type { User } from "@prisma/client";

/**
 * Direct messaging is an Exclusive-subscription benefit, not a general
 * DM system — a fan can only message a creator they actively subscribe
 * to, and a creator can only reply to their own active subscribers. This
 * is the single place that rule lives; both the send and read routes
 * call it rather than re-deriving it.
 */
export async function canMessage(currentUser: Pick<User, "id" | "role">, otherUserId: string): Promise<boolean> {
  if (currentUser.id === otherUserId) return false;

  if (currentUser.role === "CREATOR") {
    const creatorProfile = await db.creatorProfile.findUnique({
      where: { userId: currentUser.id },
      select: { id: true },
    });
    if (!creatorProfile) return false;
    const activeSub = await db.subscription.findFirst({
      where: {
        fanId: otherUserId,
        creatorProfileId: creatorProfile.id,
        status: "ACTIVE",
        currentPeriodEnd: { gte: new Date() },
      },
      select: { id: true },
    });
    return Boolean(activeSub);
  }

  // Fan (or anyone else) messaging a creator: otherUserId must actually be
  // a creator, and the current user must hold an active subscription to
  // that specific creator.
  const otherCreatorProfile = await db.creatorProfile.findUnique({
    where: { userId: otherUserId },
    select: { id: true },
  });
  if (!otherCreatorProfile) return false;

  const activeSub = await db.subscription.findFirst({
    where: {
      fanId: currentUser.id,
      creatorProfileId: otherCreatorProfile.id,
      status: "ACTIVE",
      currentPeriodEnd: { gte: new Date() },
    },
    select: { id: true },
  });
  return Boolean(activeSub);
}

/** Stable, order-independent key for a conversation between two users. */
export function threadKeyFor(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(":");
}
