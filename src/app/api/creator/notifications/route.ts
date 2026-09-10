import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

/**
 * NotificationBell's dropdown-panel list (src/components/ui.tsx) — the
 * 20 most recent like/follow/subscribe events for this signed-in user,
 * newest first. No cursor/pagination: a bounded dropdown panel doesn't
 * need infinite scroll, unlike this app's real feeds — deliberate
 * simplicity, revisit only if a full standalone notifications page is
 * ever built.
 *
 * `Notification.payload` only ever stores stable ids (actorUserId, plus
 * whichever of contentId/creatorProfileId/subscriptionId apply — see
 * createNotification's own doc comment) — never a snapshotted
 * displayName/avatarUrl, which would go stale on rename. Resolved fresh
 * here instead, batched into one Profile query per page rather than
 * per row, with every avatarUrl re-signed via resolveDisplayUrl exactly
 * like every other avatar-returning route in this app already does.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  const actorIds = Array.from(
    new Set(
      notifications
        .map((n) => (n.payload as Record<string, unknown> | null)?.actorUserId)
        .filter((id): id is string => typeof id === "string")
    )
  );

  const profiles = actorIds.length
    ? await db.profile.findMany({
        where: { userId: { in: actorIds } },
        select: { userId: true, displayName: true, avatarUrl: true },
      })
    : [];

  const resolvedByUserId = new Map(
    await Promise.all(
      profiles.map(async (p) => [p.userId, { displayName: p.displayName, avatarUrl: (await resolveDisplayUrl(p.avatarUrl)) ?? null }] as const)
    )
  );

  return NextResponse.json({
    notifications: notifications.map((n) => {
      const payload = (n.payload as Record<string, unknown> | null) ?? {};
      const actorUserId = typeof payload.actorUserId === "string" ? payload.actorUserId : null;
      return {
        id: n.id,
        type: n.type,
        payload,
        readAt: n.readAt,
        createdAt: n.createdAt,
        actor: actorUserId ? (resolvedByUserId.get(actorUserId) ?? null) : null,
      };
    }),
  });
}
