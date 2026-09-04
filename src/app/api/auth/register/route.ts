import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { hashPassword, createSession } from "@/lib/auth/session";
import { sendUserEmailVerification } from "@/lib/notifications/user-email-verification";
import { getPlatformSetting } from "@/lib/config/settings";
import { BUSINESS_CONFIG_KEYS } from "@/lib/config/business";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, "Password must be at least 10 characters"),
  displayName: z.string().min(2).max(50),
  // Mandatory at signup — see Profile.country/city's comment in
  // prisma/schema.prisma for why these stay nullable at the DB level.
  country: z.string().min(1, "Country is required").max(100),
  city: z.string().min(1, "City is required").max(100),
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
  const { email, password, displayName, country, city } = parsed.data;

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  // Read before the transaction — these are config reads, not part of
  // the atomic account-creation write itself.
  const [trialEnabled, trialDurationHours] = await Promise.all([
    getPlatformSetting(BUSINESS_CONFIG_KEYS.TRIAL_ENABLED),
    getPlatformSetting(BUSINESS_CONFIG_KEYS.TRIAL_DURATION_HOURS),
  ]);

  const user = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        role: "FAN",
        // confirmsAdult is already a required, zod-enforced checkbox
        // above — this persists that fact rather than dropping it, per
        // the plan's own note: not new fabrication, just recording a
        // self-attestation the route already requires. Labeled "Age
        // confirmed (self-declared)" wherever shown to an admin, never
        // "ID-verified" — real ID-based age verification for fans is
        // explicitly out of scope for V1 (see MASTER REQUIREMENTS §9).
        ageVerified: true,
        ageVerifiedAt: new Date(),
        profile: { create: { displayName, country, city } },
        wallet: { create: {} },
      },
    });

    // MASTER REQUIREMENTS §11 — the trial grant is core account
    // provisioning, not a best-effort side-effect like the
    // notification below, so it lives inside the same atomic
    // transaction as account creation rather than a try/catch after it.
    if (trialEnabled === "true") {
      const durationHours = Number(trialDurationHours) || 24;
      await tx.fanTrial.create({
        data: {
          fanId: created.id,
          expiresAt: new Date(Date.now() + durationHours * 60 * 60 * 1000),
        },
      });
    }

    return created;
  });

  // Never lets a notification failure fail or block registration itself
  // — the account above is already committed regardless, same reasoning
  // as every other notification send in this codebase.
  try {
    await sendUserEmailVerification(user.id, user.email, displayName);
  } catch (err) {
    console.error("[register] email verification send failed", err);
  }

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
