import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import type { Prisma, VerificationType } from "@prisma/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const MAX_BYTES: Record<"IDENTITY_AGE" | "LIVENESS", number> = {
  IDENTITY_AGE: 8 * 1024 * 1024, // 8MB — a single captured photo frame
  LIVENESS: 25 * 1024 * 1024, // 25MB — a short (~6s) recorded video clip
};

const SESSION_TYPES: Record<"IDENTITY_AGE" | "LIVENESS", VerificationType[]> = {
  IDENTITY_AGE: ["IDENTITY", "AGE"],
  LIVENESS: ["LIVENESS"],
};

const CaptureSchema = z.object({
  kind: z.enum(["IDENTITY_AGE", "LIVENESS"]),
  mimeType: z.string().min(1).max(100),
  base64Data: z.string().min(1),
});

/**
 * Steps 2 and 3 of 3 of real creator verification (see /apply's
 * VerificationFlow) — both live-captured (getUserMedia + canvas/
 * MediaRecorder, never a file upload, per product decision):
 *   - IDENTITY_AGE (step 2): a selfie-holding-ID photo, unlocked once
 *     step 1 (POST .../identity-details) exists.
 *   - LIVENESS (step 3): a short recorded selfie video, unlocked once
 *     step 2 is submitted.
 *
 * Deliberately does NOT go through VerificationProvider/
 * applyVerificationOutcome: the stub provider auto-fabricates a PASSED
 * result with no real evidence, which is exactly what this app's
 * verification model exists to avoid. Instead this writes a real,
 * honest MANUAL_REVIEW status — an admin has to actually look at the
 * capture (see /api/admin/creators' review URLs and the
 * verification-review route) before a creator can advance.
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
  if (creatorProfile.status !== "VERIFICATION_REQUIRED") {
    return NextResponse.json(
      { error: `Cannot submit verification while status is "${creatorProfile.status}".` },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = CaptureSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { kind } = parsed.data;

  if (kind === "IDENTITY_AGE") {
    const identity = await db.creatorIdentity.findUnique({ where: { creatorProfileId: creatorProfile.id } });
    if (!identity) {
      return NextResponse.json({ error: "Complete your details and ID upload first." }, { status: 409 });
    }
  } else {
    const identityAgeSession = await db.verificationSession.findFirst({
      where: { creatorProfileId: creatorProfile.id, type: "IDENTITY" },
    });
    if (!identityAgeSession) {
      return NextResponse.json({ error: "Complete identity & age verification first." }, { status: 409 });
    }
  }

  const expectedPrefix = kind === "IDENTITY_AGE" ? "image/" : "video/";
  if (!parsed.data.mimeType.startsWith(expectedPrefix)) {
    return NextResponse.json(
      { error: kind === "IDENTITY_AGE" ? "Capture must be an image." : "Capture must be a video." },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(parsed.data.base64Data, "base64");
  const maxBytes = MAX_BYTES[kind];
  if (buffer.byteLength > maxBytes) {
    return NextResponse.json({ error: `Capture must be under ${maxBytes / 1024 / 1024}MB.` }, { status: 400 });
  }
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty capture." }, { status: 400 });
  }

  const storage = getMediaStorageProvider();
  const keyLabel = kind === "IDENTITY_AGE" ? "identity-age" : "liveness";
  const { storageKey } = await storage.putObject({
    key: `creator-verification/${creatorProfile.id}/${keyLabel}-${Date.now()}`,
    contentType: parsed.data.mimeType,
    body: buffer,
  });

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const type of SESSION_TYPES[kind]) {
      const existing = await tx.verificationSession.findFirst({
        where: { creatorProfileId: creatorProfile.id, type },
      });
      if (existing) {
        await tx.verificationSession.update({
          where: { id: existing.id },
          data: {
            status: "MANUAL_REVIEW",
            provider: "self_capture",
            providerSessionId: null,
            providerReference: storageKey,
            failureReason: null,
            completedAt: null,
          },
        });
      } else {
        await tx.verificationSession.create({
          data: {
            type,
            status: "MANUAL_REVIEW",
            creatorProfileId: creatorProfile.id,
            provider: "self_capture",
            providerReference: storageKey,
          },
        });
      }
    }
  });

  return NextResponse.json({ status: "MANUAL_REVIEW" });
}
