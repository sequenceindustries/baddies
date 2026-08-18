import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { getVerificationProvider } from "@/lib/providers/verification";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const StartVerificationSchema = z.object({
  verificationType: z.enum(["IDENTITY", "AGE", "LIVENESS"]),
});

/**
 * Starts a verification session for the CURRENT user's own creator
 * profile. Participant verification (for third parties in collaborative
 * content) is a separate flow — see
 * /api/creator/content/[contentId]/participants — since a participant may
 * not be a Baddies user at all.
 *
 * This route only creates the session (§5: createVerificationSession) and
 * returns a hosted URL if the provider uses one. The actual PASSED/FAILED
 * outcome always arrives via /api/webhooks/verification, never from the
 * client — same "processor is authoritative" principle as payments (§21).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator application found. Apply first." }, { status: 404 });
  }

  if (!["VERIFICATION_REQUIRED", "UNDER_REVIEW"].includes(creatorProfile.status)) {
    return NextResponse.json(
      { error: `Cannot start verification while status is "${creatorProfile.status}".` },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = StartVerificationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const provider = getVerificationProvider();
  const handle = await provider.createVerificationSession({
    subjectType: "creator",
    subjectId: creatorProfile.id,
    verificationType: parsed.data.verificationType,
    redirectUrl: `${process.env.APP_URL}/creator/verification/callback`,
  });

  const session = await db.verificationSession.create({
    data: {
      type: parsed.data.verificationType,
      status: "PENDING",
      creatorProfileId: creatorProfile.id,
      provider: provider.name,
      providerSessionId: handle.providerSessionId,
      expiresAt: handle.expiresAt,
    },
  });

  return NextResponse.json({
    verificationSessionId: session.id,
    hostedUrl: handle.hostedUrl ?? null,
    expiresAt: handle.expiresAt ?? null,
  });
}
