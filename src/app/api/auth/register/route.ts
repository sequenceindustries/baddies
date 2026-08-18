import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { hashPassword, createSession } from "@/lib/auth/session";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  displayName: z.string().min(2).max(50),
  // Explicit self-attestation checkbox is required before any account is
  // created. This is NOT the age-verification workflow itself (see
  // src/lib/providers/verification) — it's the initial gate per build
  // brief §5 ("Implement: Age gate"). Real verification happens later for
  // creators, and can be layered in for fans per compliance requirements.
  confirmsAdult: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you are 18 or older to register." }),
  }),
});

export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, password, displayName } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const user = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: "FAN",
        profile: { create: { displayName } },
        wallet: { create: {} },
      },
    });
    return created;
  });

  const { token, expiresAt } = await createSession(user.id, user.role, {
    userAgent: req.headers.get("user-agent") ?? undefined,
    ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
  });

  const response = NextResponse.json({ userId: user.id }, { status: 201 });
  response.cookies.set(process.env.SESSION_COOKIE_NAME ?? "baddies_session", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });
  return response;
}
