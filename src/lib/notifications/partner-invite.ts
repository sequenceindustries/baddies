import { getNotificationProvider } from "@/lib/providers/notification";
import { createPartnerInviteToken } from "@/lib/founding/partner-invite-token";

/**
 * The actual accept-invite URL for a given invitation — used both to
 * mail it (sendPartnerInviteEmail below) and to hand it straight back to
 * the admin UI in the invitations routes' own JSON response. Email
 * delivery isn't guaranteed (a sandboxed notification provider, a typo'd
 * address, a spam filter) and an invite has no other channel once it's
 * gone, so the admin always gets the real, working link back regardless
 * of whether the send itself succeeds — copyable and shareable through
 * whatever channel actually reaches the invitee.
 */
export async function buildPartnerInviteUrl(invitationId: string, ttlSeconds?: number): Promise<string> {
  const appUrl = process.env.APP_URL ?? "https://baddies.africa";
  const token = await createPartnerInviteToken(invitationId, ttlSeconds);
  return `${appUrl}/partner-invite?token=${encodeURIComponent(token)}`;
}

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
 * fail or block the admin's invite/resend action itself. Takes the
 * already-built URL (buildPartnerInviteUrl above) rather than building
 * its own, so a failed send and whatever link the admin ends up copying
 * are always the exact same token, never two different ones from two
 * separate signings.
 */
export async function sendPartnerInviteEmail(inviteUrl: string, to: string, expiresAt: Date | null): Promise<void> {
  const { subject, text } = buildPartnerInviteEmail(inviteUrl, expiresAt);
  await getNotificationProvider().sendEmail({ to, subject, text });
}
