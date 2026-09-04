import { getNotificationProvider } from "@/lib/providers/notification";
import { createOnboardingToken } from "@/lib/founding/onboarding-token";

/**
 * Fired once when an admin moves a Founding Baddie's application to
 * APPROVED (see the hook in
 * src/app/api/admin/founding-applications/[id]/route.ts) — a separate
 * email from both notifyFoundingApplicationReceived (admin-facing, at
 * application time) and sendFoundingEmailVerification (applicant-facing,
 * also at application time). This is the one that unlocks the next real
 * step: banking + agreements, which could be days or weeks after the
 * original application, hence its own long-lived token (see
 * src/lib/founding/onboarding-token.ts) rather than reusing the 48-hour
 * email-verification link.
 */
export function buildOnboardingApprovedEmail(
  stageName: string,
  onboardingUrl: string
): { subject: string; text: string } {
  const subject = "You're approved! Complete your Baddies onboarding";
  const text = [
    `Hi ${stageName},`,
    "",
    "Great news — your Founding Baddie application has been approved. The last step before you can start earning is completing your banking details and accepting the creator agreements:",
    "",
    onboardingUrl,
    "",
    "This link is valid for 30 days.",
  ].join("\n");
  return { subject, text };
}

/**
 * Caller wraps this in its own try/catch, same as every other
 * notification send in this flow — a delivery failure must never fail
 * or block the admin's approve action itself.
 */
export async function sendOnboardingApprovedEmail(
  applicationId: string,
  to: string,
  stageName: string
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "https://baddies.africa";
  const token = await createOnboardingToken(applicationId);
  const onboardingUrl = `${appUrl}/founding-baddies/complete-onboarding?token=${encodeURIComponent(token)}`;
  const { subject, text } = buildOnboardingApprovedEmail(stageName, onboardingUrl);
  await getNotificationProvider().sendEmail({ to, subject, text });
}
