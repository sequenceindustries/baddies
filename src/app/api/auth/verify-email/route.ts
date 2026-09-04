import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { verifyUserEmailVerificationToken } from "@/lib/auth/email-verification";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

const BodySchema = z.object({ token: z.string().min(1) });

/**
 * Public, unauthenticated — the token itself is the credential, same as
 * the Founding Baddies version (src/app/api/founding/verify-email/route.ts).
 * Atomic from the start via updateMany + a WHERE guard (not a plain
 * update()) — Phase 2 discovered this needed to be race-safe (a double-
 * click, two tabs, or React StrictMode's dev-mode double effect-fire)
 * only after shipping a plain read-then-write version; applied here
 * from the start instead of rediscovering the same bug.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
  }

  const userId = await verifyUserEmailVerificationToken(parsed.data.token);
  if (!userId) {
    return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
  }

  const result = await db.user.updateMany({
    where: { id: userId, emailVerified: null },
    data: { emailVerified: new Date() },
  });

  if (result.count === 0) {
    // Either already verified (idempotent success — a person may click
    // the link twice) or the user no longer exists.
    const user = await db.user.findUnique({ where: { id: userId }, select: { emailVerified: true } });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    return NextResponse.json({ alreadyVerified: true });
  }

  return NextResponse.json({ alreadyVerified: false });
}
