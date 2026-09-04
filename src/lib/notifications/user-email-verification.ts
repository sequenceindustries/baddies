import { getNotificationProvider } from "@/lib/providers/notification";
import { createUserEmailVerificationToken } from "@/lib/auth/email-verification";

/**
 * Real-account equivalent of src/lib/notifications/email-verification.ts
 * (which is Founding-Baddies-specific). Same composer/send shape.
 */
export function buildUserEmailVerificationEmail(
  displayName: string,
  verifyUrl: string
): { subject: string; text: string } {
  const subject = "Verify your email — Baddies";
  const text = [
    `Hi ${displayName},`,
    "",
    "Thanks for joining Baddies. Please confirm your email address:",
    "",
    verifyUrl,
    "",
    "This link is valid for 48 hours. If you didn't create this account, you can ignore this email.",
  ].join("\n");
  return { subject, text };
}

/**
 * Called from POST /api/auth/register after the account is created. The
 * caller wraps this in its own try/catch — a failed send must never
 * block registration itself, same as every other notification send in
 * this codebase.
 */
export async function sendUserEmailVerification(userId: string, to: string, displayName: string): Promise<void> {
  const appUrl = process.env.APP_URL ?? "https://baddies.africa";
  const token = await createUserEmailVerificationToken(userId);
  const verifyUrl = `${appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const { subject, text } = buildUserEmailVerificationEmail(displayName, verifyUrl);
  await getNotificationProvider().sendEmail({ to, subject, text });
}
