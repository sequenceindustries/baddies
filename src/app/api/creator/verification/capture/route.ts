import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import type { Prisma, VerificationType } from "@prisma/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB — a single captured frame, not a document set

const CaptureSchema = z.object({
  mimeType: z.string().min(1).max(100),
  base64Data: z.string().min(1),
});

const REQUIRED_TYPES: VerificationType[] = ["IDENTITY", "AGE", "LIVENESS"];

/**
 * Accepts a single live-captured "selfie holding ID" frame from /apply's
 * VERIFICATION_REQUIRED screen (getUserMedia + canvas — never a file
 * upload, per product decision) and uses it as evidence for all three
 * required VerificationSession types at once.
 *
 * Deliberately does NOT go through VerificationProvider/
 * applyVerificationOutcome: the stub provider auto-fabricates a PASSED
 * result with no real evidence, which is exactly what this app's
 * verification model exists to avoid. Instead this writes a real,
 * honest MANUAL_REVIEW status — an admin has to actually look at the
 * image (see /api/admin/creators' captureReviewUrl and the new
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
  if (!parsed.data.mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "Capture must be an image." }, { status: 400 });
  }

  const buffer = Buffer.from(parsed.data.base64Data, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `Capture must be under ${MAX_BYTES / 1024 / 1024}MB.` }, { status: 400 });
  }
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty capture." }, { status: 400 });
  }

  const storage = getMediaStorageProvider();
  const { storageKey } = await storage.putObject({
    key: `creator-verification/${creatorProfile.id}/liveness-${Date.now()}`,
    contentType: parsed.data.mimeType,
    body: buffer,
  });

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const type of REQUIRED_TYPES) {
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
