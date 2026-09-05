import type { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { verifyReferralAttributionToken } from "@/lib/founding/referral-attribution-token";

export const REFERRAL_COOKIE_NAME = "baddies_referral";

/**
 * Resolves the "baddies_referral" signed cookie (set by GET
 * /api/founding/referral/[code] when a visitor loads /founding-baddies
 * with a valid ?ref= code) into a FoundingPartner id — or null if there
 * is nothing to attribute. Never throws; every failure mode here (no
 * cookie, tampered/expired token, revoked/deleted/suspended partner,
 * self-referral) is just "no attribution," not an application error.
 *
 * Self-referral is checked against the partner's own account email, not
 * the free-text "stage name" — the one identity value both sides
 * actually share.
 *
 * A plain lib module rather than living in the route file itself — a
 * Next.js App Router route.ts may only export GET/POST/etc. and a
 * handful of config constants, so a reusable helper like this (also
 * exercised directly by tests/integration/referral-attribution.test.ts)
 * has to live outside it.
 */
export async function resolveReferralAttribution(req: NextRequest, applicantEmail: string): Promise<string | null> {
  const cookieToken = req.cookies.get(REFERRAL_COOKIE_NAME)?.value;
  if (!cookieToken) return null;

  const foundingPartnerId = await verifyReferralAttributionToken(cookieToken);
  if (!foundingPartnerId) return null;

  const partner = await db.foundingPartner.findUnique({
    where: { id: foundingPartnerId },
    select: { id: true, status: true, user: { select: { email: true } } },
  });
  if (!partner || partner.status !== "ACTIVE") return null;
  if (partner.user.email.toLowerCase() === applicantEmail.toLowerCase()) return null;

  return partner.id;
}
