import { cookies } from "next/headers";
import { db } from "@/lib/db/client";
import { verifySessionToken, isSessionActive } from "./session";
import type { User } from "@prisma/client";

/**
 * Resolves the current user from the session cookie for use in server
 * components / route handlers. Returns null if there is no valid,
 * non-revoked session — callers are responsible for redirecting /
 * returning 401 as appropriate for their context.
 */
export async function getCurrentUser(): Promise<User | null> {
  const session = await getCurrentUserAndSession();
  return session?.user ?? null;
}

/**
 * Same resolution as getCurrentUser, plus the session record's own id —
 * needed anywhere that has to distinguish "this session" from the
 * account's other sessions (e.g. changing password or "sign out
 * everywhere else": revoke every Session row for this user except this
 * one, so the request making the change doesn't lock itself out).
 */
export async function getCurrentUserAndSession(): Promise<{ user: User; sessionId: string } | null> {
  const cookieStore = cookies();
  const token = cookieStore.get(process.env.SESSION_COOKIE_NAME ?? "baddies_session")?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const active = await isSessionActive(claims.sid);
  if (!active) return null;

  const user = await db.user.findUnique({ where: { id: claims.sub } });
  if (!user || !user.isActive) return null;

  return { user, sessionId: claims.sid };
}
