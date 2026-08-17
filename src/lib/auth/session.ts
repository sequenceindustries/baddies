import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { db } from "@/lib/db/client";
import type { UserRole } from "@prisma/client";

const AUTH_SECRET = process.env.AUTH_SECRET;
const SESSION_TTL_SECONDS = Number(process.env.SESSION_TTL_SECONDS ?? 60 * 60 * 24 * 30);

function getSecretKey(): Uint8Array {
  if (!AUTH_SECRET || AUTH_SECRET.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set a long random value in your environment — never commit real secrets."
    );
  }
  return new TextEncoder().encode(AUTH_SECRET);
}

export interface SessionClaims {
  sub: string; // user id
  role: UserRole;
  sid: string; // session record id, so it can be revoked server-side
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Creates a DB-backed session (so it can be revoked / audited) and returns
 * a signed JWT the client stores as an httpOnly cookie. The JWT alone is
 * never sufficient to prove liveness of the session — callers that need
 * strong guarantees (e.g. before a financial action) should re-check
 * `sessions.revokedAt` in the DB.
 */
export async function createSession(userId: string, role: UserRole, meta?: {
  userAgent?: string;
  ipAddress?: string;
}): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const rawToken = nanoid(32);
  const tokenHash = await bcrypt.hash(rawToken, 10);

  const session = await db.session.create({
    data: {
      userId,
      tokenHash,
      userAgent: meta?.userAgent,
      ipAddress: meta?.ipAddress,
      expiresAt,
    },
  });

  const jwt = await new SignJWT({ role, sid: session.id } satisfies Omit<SessionClaims, "sub">)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(getSecretKey());

  return { token: jwt, sessionId: session.id, expiresAt };
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (!payload.sub || !payload.role || !payload.sid) return null;
    return {
      sub: payload.sub as string,
      role: payload.role as UserRole,
      sid: payload.sid as string,
    };
  } catch {
    return null;
  }
}

export async function revokeSession(sessionId: string): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { revokedAt: new Date() },
  });
}

/** Server-side check that a session is still valid (not revoked, not expired). */
export async function isSessionActive(sessionId: string): Promise<boolean> {
  const session = await db.session.findUnique({ where: { id: sessionId } });
  if (!session) return false;
  if (session.revokedAt) return false;
  if (session.expiresAt < new Date()) return false;
  return true;
}
