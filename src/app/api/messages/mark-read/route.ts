import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Marks every unread `"message.received"` notification read for the
 * current user, fired the instant MessageBell's panel opens — mirrors
 * NotificationBell's own mark-all-on-open convention
 * (POST /api/creator/notifications/mark-read), scoped to just the
 * message type so opening one bell never clears the other's badge.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null, type: "message.received" },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
