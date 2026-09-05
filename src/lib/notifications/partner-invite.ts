import { getNotificationProvider } from "@/lib/providers/notification";
import { createPartnerInviteToken } from "@/lib/founding/partner-invite-token";

/**
 * Fired when an admin creates (or resends) a Founding Partner invitation.
 * Same shape as sendOnboardingApprovedEmail: a self-contained signed
 * token (src/lib/founding/partner-invite-token.ts) rather than a bare
 * id, since this link is mailed to someone with no account yet.
 */
export function buildPartnerInviteEmail(
  inviteUrl: string,
  expiresAt: Date | null
): { subject: string; text: string } {
  const subject = "You're invited: Founding Partner at baddies";
  const expiryLine = expiresAt
    ? `This invitation expires on ${expiresAt.toLocaleDateString()}.`
    : "This invitation doesn't expire until it's used or revoked.";
  const text = [
    "Hi,",
    "",
    "You've been invited to become a Founding Partner at baddies — a private, invitation-only role helping bring the first generation of creators onto the platform.",
    "",
    "Review the Founding Partner agreement and activate your account here:",
    "",
    inviteUrl,
    "",
    expiryLine,
    "",
    "This invitation is personal to you and can only be used once — please don't forward it.",
  ].join("\n");
  return { subject, text };
}

/**
 * Caller wraps this in its own try/catch, same as every other
 * notification send in this codebase — a delivery failure must never
 * fail or block the admin's invite/resend action itself.
 *
 * ttlSeconds should be derived from the invitation's own expiresAt (if
 * the admin set one); pass undefined to fall back to the token module's
 * own default.
 */
export async function sendPartnerInviteEmail(
  invitationId: string,
  to: string,
  expiresAt: Date | null,
  ttlSeconds?: number
): Promise<void> {
  const appUrl = process.env.APP_URL ?? "https://baddies.africa";
  const token = await createPartnerInviteToken(invitationId, ttlSeconds);
  const inviteUrl = `${appUrl}/partner-invite?token=${encodeURIComponent(token)}`;
  const { subject, text } = buildPartnerInviteEmail(inviteUrl, expiresAt);
  await getNotificationProvider().sendEmail({ to, subject, text });
}
