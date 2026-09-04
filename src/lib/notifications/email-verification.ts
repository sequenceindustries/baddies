import { getNotificationProvider } from "@/lib/providers/notification";
import { createEmailVerificationToken } from "@/lib/founding/email-verification";

/**
 * Applicant-facing email — distinct from notifyFoundingApplicationReceived
 * (src/lib/notifications/founding-application.ts), which alerts the admin
 * inbox. This one goes to the applicant themselves. Same shape: a pure
 * composer (unit-testable without mocking fetch/JWT signing) plus a thin
 * send wrapper.
 */
export function buildEmailVerificationEmail(
  stageName: string,
  verifyUrl: string
): { subject: string; text: string } {
  const subject = "Verify your email — Baddies Founding Baddies application";
  const text = [
    `Hi ${stageName},`,
    "",
    "Thanks for applying to become a Founding Baddie. Please confirm your email address to continue:",
    "",
    verifyUrl,
    "",
    "This link is valid for 48 hours. If you didn't apply to Baddies, you can ignore this email.",
  ].join("\n");
  return { subject, text };
}

/**
 * Called from POST /api/founding/apply after the row is written, only on
 * the accept (South-African) path. Like notifyFoundingApplicationReceived,
 * the caller wraps this in its own try/catch — a failed send must never
 * block the applicant's submission. Unlike that function, this one has no
 * "unset env var, skip" escape hatch — the applicant's own email is
 * always known (it's the address they just submitted), so there's nothing
 * to be missing here beyond the notification provider itself failing.
 */
export async function sendFoundingEmailVerification(
  applicationId: string,
  to: string,
  stageName: string
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "https://baddies.africa";
  const token = await createEmailVerificationToken(applicationId);
  // `id` alongside `token` isn't a security-relevant duplication — the
  // token alone is what /api/founding/verify-email actually trusts. The
  // id here only tells the client-side resume panel (ApplicationNextSteps)
  // which application to poll /status against, since decoding the JWT
  // payload client-side just to read a non-secret claim would be an
  // odd, roundabout way to get the same value.
  const verifyUrl = `${appUrl}/founding-baddies/verify-email?token=${encodeURIComponent(token)}&id=${encodeURIComponent(applicationId)}`;
  const { subject, text } = buildEmailVerificationEmail(stageName, verifyUrl);
  await getNotificationProvider().sendEmail({ to, subject, text });
}
