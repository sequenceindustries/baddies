import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { buildGoogleAuthUrl, isGoogleAuthConfigured } from "@/lib/auth/google";

// Always dynamic: builds a redirect using live request/env state and
// sets a cookie — must never be statically prerendered or cached.
export const dynamic = "force-dynamic";

const STATE_COOKIE = "google_oauth_state";

/**
 * Starting point for "Continue with Google" (/login, /register). A
 * plain redirect, not a fetch target — the browser navigates here
 * directly (an <a href> / router.push), same as any other OAuth
 * "Login with X" button.
 */
export async function GET(req: NextRequest) {
  if (!isGoogleAuthConfigured()) {
    return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 404 });
  }

  // Where to send the visitor after a successful callback — carried
  // through `state` isn't safe (state is also this route's CSRF token,
  // and stuffing extra data into it invites tampering), so it rides
  // alongside in its own short-lived cookie instead.
  const returnTo = req.nextUrl.searchParams.get("returnTo");

  const state = nanoid(24);
  const response = NextResponse.redirect(buildGoogleAuthUrl(state));
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 600, // 10 minutes — plenty for a real consent-screen round trip
    path: "/",
  };
  response.cookies.set(STATE_COOKIE, state, cookieOpts);
  if (returnTo && returnTo.startsWith("/")) {
    // startsWith("/") only — never redirect off-site after callback,
    // regardless of what a caller passes here.
    response.cookies.set("google_oauth_return_to", returnTo, cookieOpts);
  }
  return response;
}
