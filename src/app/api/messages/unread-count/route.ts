import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The cheap poll target for MessageBell's 45s interval
 * (src/components/ui.tsx) — counts unread `"message.received"`
 * Notification rows for the current user (written by both POST /api/
 * creators/:id/message and POST /api/creator/messages/:threadKey, the
 * two places a Message can be created). Deliberately its own type-
 * scoped count, separate from NotificationBell's own unread-count
 * route, so a new message is never double-counted across both bells.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const count = await db.notification.count({
    where: { userId: user.id, readAt: null, type: "message.received" },
  });
  return NextResponse.json({ count });
}
