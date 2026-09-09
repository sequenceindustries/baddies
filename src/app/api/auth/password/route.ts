import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserAndSession } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { verifyPassword, hashPassword, revokeOtherSessions } from "@/lib/auth/session";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

// Always dynamic: reads/writes live session + account data.
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password."),
  newPassword: z.string().min(10, "New password must be at least 10 characters"),
});

/**
 * Real account-settings action (Settings, not Profile — see the split
 * in src/app/profile/page.tsx and src/app/settings/page.tsx). Requires
 * the current password, same as any real "change password" flow — a
 * live session cookie alone isn't proof of knowing the password. On
 * success, every other active session for this account is revoked
 * (see revokeOtherSessions) — standard practice after a password
 * change, and meaningful here since this may be exactly the moment
 * someone's securing an account they suspect is compromised.
 */
export async function PATCH(req: NextRequest) {
  const session = await getCurrentUserAndSession();
  if (!session) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { user, sessionId } = session;

  const rateLimit = checkRateLimit(`password-change:${user.id}`, 5, 15 * 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { currentPassword, newPassword } = parsed.data;

  const correct = await verifyPassword(currentPassword, user.passwordHash);
  if (!correct) {
    return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });
  }

  const passwordHash = await hashPassword(newPassword);
  await db.user.update({ where: { id: user.id }, data: { passwordHash } });
  const revokedCount = await revokeOtherSessions(user.id, sessionId);

  return NextResponse.json({ changed: true, otherSessionsSignedOut: revokedCount });
}
