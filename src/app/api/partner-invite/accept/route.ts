import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { hashPassword, createSession } from "@/lib/auth/session";
import { verifyPartnerInviteToken } from "@/lib/founding/partner-invite-token";
import { checkRateLimitByIp, rateLimitResponse } from "@/lib/security/rate-limit";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const AcceptSchema = z.object({
  token: z.string().min(1),
  displayName: z.string().min(2).max(50),
  password: z.string().min(10, "Password must be at least 10 characters"),
  agreesToPartnerAgreement: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Founding Partner agreement to activate your account." }),
  }),
});

/**
 * Activates a Founding Partner: verifies the token AND re-checks the
 * PartnerInvitation row's own live status/expiry (never trust the token
 * alone — see that model's schema comment), then in one transaction
 * creates the real User (role PARTNER), a public Profile, the
 * FoundingPartner row itself (unique referralCode), an AgreementAcceptance
 * for the current PARTNER_AGREEMENT version (reusing the previously-
 * unused userId slot on that model), and marks the invitation ACCEPTED.
 * Logs the visitor in immediately afterward, same as registration.
 */
export async function POST(req: NextRequest) {
  // 10 per 15 minutes per IP — this creates a real account, so tighter
  // than a plain read; still comfortably above what one real invitee
  // filling in the form (with a retry or two) would ever hit.
  const rateLimit = checkRateLimitByIp(req, "partner-invite-accept", 10, 15 * 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const json = await req.json().catch(() => null);
  const parsed = AcceptSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { token, displayName, password } = parsed.data;

  const invitationId = await verifyPartnerInviteToken(token);
  if (!invitationId) {
    return NextResponse.json({ error: "This invitation link is invalid." }, { status: 400 });
  }

  const invitation = await db.partnerInvitation.findUnique({ where: { id: invitationId } });
  if (!invitation) {
    return NextResponse.json({ error: "This invitation link is invalid." }, { status: 400 });
  }
  if (invitation.status !== "PENDING") {
    return NextResponse.json({ error: `This invitation is no longer available (${invitation.status.toLowerCase()}).` }, { status: 409 });
  }
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) {
    return NextResponse.json({ error: "This invitation has expired." }, { status: 409 });
  }

  const existingUser = await db.user.findUnique({ where: { email: invitation.email } });
  if (existingUser) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const agreement = await db.agreement.findFirst({
    where: { type: "PARTNER_AGREEMENT" },
    orderBy: { effectiveAt: "desc" },
  });
  if (!agreement) {
    return NextResponse.json({ error: "Founding Partner agreement unavailable — try again shortly." }, { status: 500 });
  }

  const passwordHash = await hashPassword(password);
  // Copied to plain, non-nullable locals before the closure below — TS
  // control-flow narrowing (invitation is not null, checked above)
  // doesn't persist through a nested function boundary.
  const invitationEmail = invitation.email;
  const invitationId2 = invitation.id;

  // referralCode collisions are astronomically unlikely at nanoid(8) with
  // at most 10 partners ever, but a short retry loop costs nothing and
  // avoids a hard 500 on the one-in-a-billion case.
  async function createWithFreshReferralCode(tx: Prisma.TransactionClient, attemptsLeft = 5): Promise<{ userId: string; partnerId: string; referralCode: string }> {
    const referralCode = nanoid(8);
    try {
      const user = await tx.user.create({
        data: {
          email: invitationEmail,
          passwordHash,
          role: "PARTNER",
          emailVerified: new Date(), // admin sent this invite directly to a known address
          ageVerified: true,
          ageVerifiedAt: new Date(),
          profile: { create: { displayName } },
          wallet: { create: {} },
        },
      });
      const partner = await tx.foundingPartner.create({
        data: { userId: user.id, invitationId: invitationId2, referralCode },
      });
      return { userId: user.id, partnerId: partner.id, referralCode };
    } catch (err) {
      const isUniqueViolation = typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
      if (isUniqueViolation && attemptsLeft > 1) {
        return createWithFreshReferralCode(tx, attemptsLeft - 1);
      }
      throw err;
    }
  }

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const { userId, partnerId, referralCode } = await createWithFreshReferralCode(tx);

    await tx.agreementAcceptance.create({
      data: {
        agreementId: agreement.id,
        userId,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    await tx.partnerInvitation.update({
      where: { id: invitation.id },
      data: { status: "ACCEPTED", acceptedAt: new Date() },
    });

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "founding_partner.activated",
        targetType: "founding_partner",
        targetId: partnerId,
        metadata: { invitationId: invitation.id },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return { userId, referralCode };
  });

  const { token: sessionToken, expiresAt } = await createSession(result.userId, "PARTNER", {
    userAgent: req.headers.get("user-agent") ?? undefined,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const response = NextResponse.json({ userId: result.userId, referralCode: result.referralCode }, { status: 201 });
  response.cookies.set(process.env.SESSION_COOKIE_NAME ?? "baddies_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
