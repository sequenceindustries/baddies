import { NextResponse } from "next/server";
import { isGoogleAuthConfigured } from "@/lib/auth/google";

// Always dynamic: reflects live env var state, not something to cache
// at build time (credentials can be added/removed without a rebuild).
export const dynamic = "force-dynamic";

/**
 * Tiny, public, unauthenticated: lets /login and /register decide
 * whether to render "Continue with Google" at all, instead of always
 * showing a button that 404s when Google isn't configured (see
 * GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET in .env.example).
 */
export async function GET() {
  return NextResponse.json({ enabled: isGoogleAuthConfigured() });
}
