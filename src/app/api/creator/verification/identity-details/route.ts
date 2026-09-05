import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { encryptField } from "@/lib/security/field-encryption";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB — same ceiling as Founding's identity-document upload

const DetailsSchema = z.object({
  dateOfBirth: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date of birth."),
  nationality: z.string().min(1).max(100),
  idNumber: z.string().min(3).max(50),
  document: z.object({
    mimeType: z.string().min(1).max(100),
    base64Data: z.string().min(1),
  }),
});

function isAtLeast18(dateOfBirth: Date): boolean {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) age--;
  return age >= 18;
}

/**
 * Step 1 of 3 of real creator verification (see /apply's
 * VerificationFlow): date of birth, nationality, ID number, and an
 * uploaded ID-document image — a regular upload, not a live capture
 * (that's steps 2-3, see POST .../capture). Upserts in place so a
 * creator can correct and resubmit after a rejection without
 * accumulating rows. Unlocks step 2 (the live selfie-holding-ID photo),
 * enforced by that route checking for this row's existence.
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
  const parsed = DetailsSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { dateOfBirth, nationality, idNumber, document } = parsed.data;

  const dob = new Date(dateOfBirth);
  if (!isAtLeast18(dob)) {
    return NextResponse.json({ error: "You must be 18 or older to become a creator." }, { status: 400 });
  }
  if (!document.mimeType.startsWith("image/")) {
    return NextResponse.json({ error: "ID document must be an image." }, { status: 400 });
  }

  const buffer = Buffer.from(document.base64Data, "base64");
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: `ID document must be under ${MAX_BYTES / 1024 / 1024}MB.` }, { status: 400 });
  }
  if (buffer.byteLength === 0) {
    return NextResponse.json({ error: "Empty document upload." }, { status: 400 });
  }

  const storage = getMediaStorageProvider();
  const { storageKey } = await storage.putObject({
    key: `creator-verification/${creatorProfile.id}/id-document-${Date.now()}`,
    contentType: document.mimeType,
    body: buffer,
  });
  const idNumberEncrypted = encryptField(idNumber);

  await db.$transaction([
    db.creatorIdentity.upsert({
      where: { creatorProfileId: creatorProfile.id },
      create: { creatorProfileId: creatorProfile.id, dateOfBirth: dob, nationality, idNumberEncrypted },
      update: { dateOfBirth: dob, nationality, idNumberEncrypted },
    }),
    db.creatorIdentityDocument.upsert({
      where: { creatorProfileId: creatorProfile.id },
      create: { creatorProfileId: creatorProfile.id, storageKey, mimeType: document.mimeType },
      update: { storageKey, mimeType: document.mimeType, uploadedAt: new Date() },
    }),
  ]);

  return NextResponse.json({ submitted: true });
}
