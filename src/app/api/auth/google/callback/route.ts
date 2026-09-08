import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import type { Prisma, UserRole } from "@prisma/client";
import { createSession, hashPassword } from "@/lib/auth/session";
import { exchangeGoogleCode, isGoogleAuthConfigured } from "@/lib/auth/google";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

// Always dynamic: reads/writes live session + account data.
export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_oauth_state";
const RETURN_TO_COOKIE = "google_oauth_return_to";

function failure(req: NextRequest, reason: string): NextResponse {
  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("error", reason);
  const response = NextResponse.redirect(url);
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(RETURN_TO_COOKIE);
  return response;
}

/**
 * Handles Google's redirect back after the consent screen. Two outcomes
 * for a verified Google email: an existing account with that email signs
 * in as-is (role/history untouched — Google only ever proves "this
 * person owns this email," the same fact our own email-verification
 * flow proves, so linking by verified email is the standard, safe
 * pattern here); no match creates a brand-new FAN account, mirroring
 * POST /api/auth/register's own account-provisioning shape (profile,
 * wallet, trial grant) minus the password (a Google-only account gets a
 * securely random, never-shared password hash — there's no password
 * login for it until/unless a real "set a password" flow is added).
 */
export async function GET(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return failure(req, "google_not_configured");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const expectedState = req.cookies.get(STATE_COOKIE)?.value;
  const returnTo = req.cookies.get(RETURN_TO_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    return failure(req, "google_state_mismatch");
  }

  let profile;
  try {
    profile = await exchangeGoogleCode(code);
  } catch (err) {
    console.error("[google-callback] token exchange/verification failed", err);
    return failure(req, "google_exchange_failed");
  }

  if (!profile.emailVerified) {
    return failure(req, "google_email_unverified");
  }

  let userId: string;
  let role: UserRole;

  const existing = await db.user.findUnique({ where: { email: profile.email } });
  if (existing) {
    userId = existing.id;
    role = existing.role;
  } else {
    const [trialEnabled, trialDurationHours] = await Promise.all([
      getPlatformSetting(BUSINESS_CONFIG_KEYS.TRIAL_ENABLED),
      getPlatformSetting(BUSINESS_CONFIG_KEYS.TRIAL_DURATION_HOURS),
    ]);
    // Never shown to, or usable by, the account holder — this account
    // only ever signs in via Google. A long random value, hashed the
    // same way a real password would be, so nothing about this row
    // looks different from any other User to the rest of the app.
    const passwordHash = await hashPassword(nanoid(48));

    const created = await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const user = await tx.user.create({
        data: {
          email: profile!.email,
          passwordHash,
          role: "FAN",
          // Google's own account-creation flow already requires being
          // over its own minimum age, and this app's site-wide age-gate
          // interstitial (see globals age-gate) already stood between
          // this visitor and the "Continue with Google" button — same
          // self-attestation basis POST /api/auth/register records
          // explicitly, not silently skipped here.
          ageVerified: true,
          ageVerifiedAt: new Date(),
          emailVerified: new Date(), // Google already verified it — no need to send our own verification email
          profile: { create: { displayName: profile!.name || profile!.email.split("@")[0] || profile!.email } },
          wallet: { create: {} },
        },
      });

      if (trialEnabled === "true") {
        const durationHours = Number(trialDurationHours) || 24;
        await tx.fanTrial.create({
          data: { fanId: user.id, expiresAt: new Date(Date.now() + durationHours * 60 * 60 * 1000) },
        });
      }

      return user;
    });

    userId = created.id;
    role = created.role;
  }

  const { token, expiresAt } = await createSession(userId, role, {
    userAgent: req.headers.get("user-agent") ?? undefined,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const destination = returnTo && returnTo.startsWith("/") ? returnTo : "/";
  const response = NextResponse.redirect(new URL(destination, req.nextUrl.origin));
  response.cookies.set(process.env.SESSION_COOKIE_NAME ?? "baddies_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  response.cookies.delete(STATE_COOKIE);
  response.cookies.delete(RETURN_TO_COOKIE);
  return response;
}
