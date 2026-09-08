/**
 * "Continue with Google" — a hand-rolled OAuth2/OIDC authorization-code
 * flow against Google's own endpoints, matching this codebase's existing
 * DIY auth (custom JWT sessions in session.ts, no framework auth
 * library). No new dependency: three plain fetch calls, no SDK.
 *
 * Requires GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (see .env.example for
 * how to get real values and which redirect URIs to whitelist).
 * Deliberately optional at runtime — isGoogleAuthConfigured() lets both
 * the UI (hide the button) and the routes (404 instead of crashing)
 * degrade cleanly when unset, the same pattern every other optional
 * provider in this app follows (Resend, WhatsApp, verification/payment
 * stubs).
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

export function isGoogleAuthConfigured(): boolean {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
}

/** Must exactly match one of the OAuth client's "Authorized redirect URIs" in Google Cloud Console. */
export function googleRedirectUri(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/api/auth/google/callback`;
}

export function buildGoogleAuthUrl(state: string): string {
  if (!GOOGLE_CLIENT_ID) throw new Error("GOOGLE_CLIENT_ID is not set.");
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    // Always shows the account chooser — a shared/library computer
    // shouldn't silently sign in whoever's Google session happens to be
    // active.
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export interface GoogleProfile {
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Exchanges an authorization code for tokens, then verifies + decodes
 * the id_token via Google's own tokeninfo endpoint rather than this app
 * managing a JWKS cache to verify the signature itself — simpler, and
 * Google already checks signature/audience/expiry server-side for us.
 * Documented tradeoff: tokeninfo has a modest, undocumented rate limit
 * intended for debugging/low-volume use; fine for this app's current
 * traffic, worth revisiting (verify the JWT locally against Google's
 * published JWKS instead) if Google sign-in volume ever gets large.
 */
export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) throw new Error("Google sign-in is not configured.");

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: googleRedirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Google token exchange failed (${tokenRes.status}).`);
  }
  const tokenBody = (await tokenRes.json()) as { id_token?: string };
  if (!tokenBody.id_token) {
    throw new Error("Google didn't return an id_token.");
  }

  const infoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(tokenBody.id_token)}`
  );
  if (!infoRes.ok) {
    throw new Error(`Google id_token verification failed (${infoRes.status}).`);
  }
  const info = (await infoRes.json()) as {
    aud?: string;
    email?: string;
    email_verified?: string | boolean;
    name?: string;
    picture?: string;
  };

  if (info.aud !== GOOGLE_CLIENT_ID) {
    throw new Error("Google id_token audience mismatch.");
  }
  if (!info.email) {
    throw new Error("Google account has no email.");
  }

  return {
    email: info.email,
    emailVerified: info.email_verified === true || info.email_verified === "true",
    name: info.name ?? null,
    picture: info.picture ?? null,
  };
}
