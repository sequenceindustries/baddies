import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A short, generated, human-shareable reference number for a
 * PartnerInvitation — "Invite #482917" — so an admin can refer to and
 * track an invitation by something other than an email address they may
 * not have (see that model's own schema comment). Not itself a secret:
 * the real access control on the invite link is the signed JWT in
 * partner-invite-token.ts, so a plain 6-digit code with no
 * cryptographic unpredictability requirement is fine here — this only
 * ever needs to be unique, not unguessable.
 *
 * Collisions are astronomically unlikely (900,000 possible codes,
 * nowhere near that many partners will ever be invited) but a short
 * retry loop costs nothing and avoids a hard 500 on the one-in-a-million
 * case — same pattern as the accept route's own referralCode retry.
 */
export async function generateUniqueInvitationCode(
  tx: Prisma.TransactionClient | PrismaClient,
  attemptsLeft = 5
): Promise<string> {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const existing = await tx.partnerInvitation.findUnique({ where: { code }, select: { id: true } });
  if (!existing) return code;
  if (attemptsLeft <= 1) {
    throw new Error("Could not generate a unique invitation code after several attempts.");
  }
  return generateUniqueInvitationCode(tx, attemptsLeft - 1);
}
