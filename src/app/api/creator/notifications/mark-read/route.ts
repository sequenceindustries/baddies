import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Marks every one of this user's unread notifications read, all at
 * once — fired the instant NotificationBell's panel opens, alongside
 * the list fetch. Mark-all rather than per-item: the simplest thing
 * that satisfies "the badge clears when you open the panel," with no
 * per-row read-state UI anywhere in the panel to justify anything finer.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
