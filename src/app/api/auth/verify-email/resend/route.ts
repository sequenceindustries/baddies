import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { sendUserEmailVerification } from "@/lib/notifications/user-email-verification";
import { checkRateLimit, rateLimitResponse } from "@/lib/security/rate-limit";

// Always dynamic: sends a real email on every call.
export const dynamic = "force-dynamic";

/**
 * Resend the real-account verification email — the same one
 * POST /api/auth/register and POST /api/founding/apply both send at
 * account creation. Authenticated (unlike those two, which have no
 * session yet): this is for someone who already has an account and
 * just missed or lost the original email, surfaced as a "Resend" action
 * wherever emailVerified === false is shown (see /creator-dashboard's
 * StatusPanel).
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (user.emailVerified) {
    return NextResponse.json({ error: "Your email is already verified." }, { status: 409 });
  }

  // 3 per 15 minutes per account — a real resend need is rare; this is
  // just enough to stop someone hammering the button into a mail-sending
  // loop.
  const rateLimit = checkRateLimit(`verify-email-resend:${user.id}`, 3, 15 * 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const profile = await db.profile.findUnique({ where: { userId: user.id }, select: { displayName: true } });

  try {
    await sendUserEmailVerification(user.id, user.email, profile?.displayName ?? user.email);
  } catch (err) {
    console.error("[verify-email-resend] send failed", err);
    return NextResponse.json({ error: "Couldn't send the email. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ sent: true });
}
