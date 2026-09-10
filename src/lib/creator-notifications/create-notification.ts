import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";

/**
 * Writes one row to the existing (previously unused) `Notification`
 * model — the in-app "a fan liked/followed/subscribed to you" signal
 * shown via the nav's NotificationBell (src/components/ui.tsx). Not to
 * be confused with src/lib/notifications/*.ts, which is a completely
 * separate concern (outbound transactional EMAIL via
 * getNotificationProvider() — verification links, partner invites,
 * etc.); this directory is deliberately separate so "send an email" and
 * "write an in-app Notification row" never get conflated at the
 * import-path level.
 *
 * `payload` carries only stable ids (e.g. actorUserId, contentId,
 * creatorProfileId, threadKey) — never a snapshotted displayName/
 * avatarUrl, which would go stale the moment the actor renames or
 * re-uploads their avatar. Each reader route resolves those fresh at
 * read time instead (see GET /api/creator/notifications and GET
 * /api/messages/unread-count).
 *
 * `"message.received"` is deliberately excluded from the general
 * NotificationBell's own list/count routes (both filter to an explicit
 * allowlist of the other three types) — it powers the separate
 * MessageBell instead (src/components/ui.tsx), so a new message never
 * gets counted twice across two different bells.
 *
 * Best-effort, matching src/lib/notifications/*.ts's own "a failed send
 * must never block the primary action" convention: by the time this
 * runs, the like/follow/subscribe/message write it's reporting on has
 * already succeeded, so a failure here must never turn that into an
 * error for the person who took the action.
 */
// The three "social" types NotificationBell's own list/count/mark-read
// routes filter to explicitly (an allowlist, not just "not messages")
// so a future new type added here doesn't silently start showing up in
// the wrong bell without a conscious choice at each reader route.
export const SOCIAL_NOTIFICATION_TYPES = ["content.liked", "creator.followed", "creator.subscribed"] as const;

export async function createNotification(input: {
  userId: string;
  type: "content.liked" | "creator.followed" | "creator.subscribed" | "message.received";
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.notification.create({
      data: { userId: input.userId, type: input.type, payload: input.payload as Prisma.InputJsonValue },
    });
  } catch (err) {
    console.error("createNotification failed", { type: input.type, userId: input.userId, err });
  }
}
