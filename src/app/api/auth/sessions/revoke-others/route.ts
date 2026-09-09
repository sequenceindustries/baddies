import { NextResponse } from "next/server";
import { getCurrentUserAndSession } from "@/lib/auth/current-user";
import { revokeOtherSessions } from "@/lib/auth/session";

// Always dynamic: writes live session data.
export const dynamic = "force-dynamic";

/**
 * "Sign out of all other devices" (Settings) — revokes every other
 * active Session row for this account, leaving the one making this
 * request untouched so the current tab stays signed in.
 */
export async function POST() {
  const session = await getCurrentUserAndSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const revokedCount = await revokeOtherSessions(session.user.id, session.sessionId);
  return NextResponse.json({ revokedCount });
}
