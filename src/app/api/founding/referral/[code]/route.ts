import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { createReferralAttributionToken } from "@/lib/founding/referral-attribution-token";
import { REFERRAL_COOKIE_NAME } from "@/lib/founding/referral-attribution";
import { checkRateLimitByIp, rateLimitResponse } from "@/lib/security/rate-limit";

// Always dynamic: reads live data (DB) and sets a cookie.
export const dynamic = "force-dynamic";

const COOKIE_TTL_SECONDS = 60 * 60 * 24 * 7; // matches referral-attribution-token.ts's own TTL

/**
 * Public, unauthenticated — called once by /founding-baddies when it
 * loads with a ?ref=<code> query param. Sets a signed, httpOnly cookie
 * (never a raw, tamperable partnerId) that POST /api/founding/apply
 * later reads to attribute the resulting application. An invalid,
 * unknown, or suspended code is a silent no-op (valid: false) — never an
 * error the visitor sees, since browsing /founding-baddies must work
 * exactly the same with or without a referral.
 */
export async function GET(req: NextRequest, { params }: { params: { code: string } }) {
  // 30 per 15 minutes per IP — generous for a real visitor loading the
  // page normally, tight enough to blunt scripted enumeration of
  // referral codes.
  const rateLimit = checkRateLimitByIp(req, "founding-referral", 30, 15 * 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const partner = await db.foundingPartner.findUnique({
    where: { referralCode: params.code },
    select: { id: true, status: true },
  });

  if (!partner || partner.status !== "ACTIVE") {
    return NextResponse.json({ valid: false });
  }

  const token = await createReferralAttributionToken(partner.id);
  const response = NextResponse.json({ valid: true });
  response.cookies.set(REFERRAL_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_TTL_SECONDS,
    path: "/",
  });
  return response;
}
