import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { SOCIAL_NOTIFICATION_TYPES } from "@/lib/creator-notifications/create-notification";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The cheap poll target for NotificationBell's 45s interval
 * (src/components/ui.tsx) — a single indexed count, not the list
 * itself (GET /api/creator/notifications, fetched only when the panel
 * actually opens). No creator-role check beyond auth: every query is
 * already scoped to this signed-in user's own id, so a non-creator
 * calling this just gets 0 — matches src/app/api/creator/wallet/
 * route.ts's own lenient auth-only precedent. "For creators" is a
 * client-side UI statement, not a data-sensitivity boundary.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  // Excludes "message.received" — that type powers the separate
  // MessageBell (src/components/ui.tsx) instead, so a new message never
  // gets counted twice across two different bells.
  const count = await db.notification.count({
    where: { userId: user.id, readAt: null, type: { in: [...SOCIAL_NOTIFICATION_TYPES] } },
  });
  return NextResponse.json({ count });
}
