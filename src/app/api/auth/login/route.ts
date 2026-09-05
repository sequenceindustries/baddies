import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verifyPassword, createSession } from "@/lib/auth/session";
import { checkRateLimitByIp, rateLimitResponse } from "@/lib/security/rate-limit";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // 10 attempts per 15 minutes per IP — a basic anti-brute-force guard
  // that didn't exist on this route at all before (confirmed via review:
  // no rate limiting existed anywhere in this codebase). Keyed by IP, not
  // by the submitted email, so it can't be used to enumerate which
  // emails have accounts.
  const rateLimit = checkRateLimitByIp(req, "auth-login", 10, 15 * 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const json = await req.json().catch(() => null);
  const parsed = LoginSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password } = parsed.data;

  // Deliberately generic error message — never reveal whether the email
  // exists (avoids account enumeration).
  const genericError = NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.isActive) return genericError;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return genericError;

  const { token, expiresAt } = await createSession(user.id, user.role, {
    userAgent: req.headers.get("user-agent") ?? undefined,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const response = NextResponse.json({ userId: user.id, role: user.role });
  response.cookies.set(process.env.SESSION_COOKIE_NAME ?? "baddies_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
