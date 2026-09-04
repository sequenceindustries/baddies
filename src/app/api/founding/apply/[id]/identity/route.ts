import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { encryptField } from "@/lib/security/field-encryption";
import { getMediaStorageProvider } from "@/lib/providers/storage";
import { advanceFoundingStatus } from "@/lib/founding/pipeline";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

const MAX_BYTES = 15 * 1024 * 1024; // 15MB/file — images only in V1, see the plan's note on why not video yet

const DocumentSchema = z.object({
  type: z.enum(["ID_DOCUMENT", "SELFIE", "ID_HOLDING_PHOTO"]),
  mimeType: z.string().min(1).max(100),
  base64Data: z.string().min(1),
});

const IdentitySchema = z.object({
  legalName: z.string().min(2).max(200),
  dateOfBirth: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "Invalid date of birth."),
  nationality: z.string().min(1).max(100),
  idNumber: z.string().min(3).max(50),
  documents: z.array(DocumentSchema).min(1).max(6),
});

function isAtLeast18(dateOfBirth: Date): boolean {
  const now = new Date();
  let age = now.getFullYear() - dateOfBirth.getFullYear();
  const monthDiff = now.getMonth() - dateOfBirth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dateOfBirth.getDate())) age--;
  return age >= 18;
}

/**
 * Public, unauthenticated by design — same as POST /api/founding/apply
 * itself (see that route's own comment): a Founding Baddie has no
 * account yet. Scoped by the application's cuid id, an unguessable
 * bearer-token-equivalent — nothing this route returns leaks data an
 * attacker couldn't already infer from having the id (which they'd only
 * have if they submitted the application or received the confirmation
 * email/response themselves).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const application = await db.foundingApplication.findUnique({ where: { id: params.id } });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  if (application.status === "REJECTED") {
    return NextResponse.json({ error: "This application was not accepted and can't be updated." }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = IdentitySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { legalName, dateOfBirth, nationality, idNumber, documents } = parsed.data;

  const dob = new Date(dateOfBirth);
  if (!isAtLeast18(dob)) {
    return NextResponse.json({ error: "You must be 18 or older to apply." }, { status: 400 });
  }

  const hasType = (t: string) => documents.some((d) => d.type === t);
  if (!hasType("ID_DOCUMENT") || !hasType("SELFIE")) {
    return NextResponse.json(
      { error: "An ID document and a verification selfie are both required." },
      { status: 400 }
    );
  }

  const decoded = documents.map((d) => {
    const buffer = Buffer.from(d.base64Data, "base64");
    return { ...d, buffer };
  });
  const tooLarge = decoded.find((d) => d.buffer.byteLength > MAX_BYTES);
  if (tooLarge) {
    return NextResponse.json({ error: `Each file must be under ${MAX_BYTES / 1024 / 1024}MB.` }, { status: 400 });
  }

  const storage = getMediaStorageProvider();
  const idNumberEncrypted = encryptField(idNumber);

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.identity.upsert({
      where: { foundingApplicationId: application.id },
      create: {
        foundingApplicationId: application.id,
        legalName,
        dateOfBirth: dob,
        nationality,
        idNumberEncrypted,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
      update: {
        legalName,
        dateOfBirth: dob,
        nationality,
        idNumberEncrypted,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });

    for (const doc of decoded) {
      const { storageKey } = await storage.putObject({
        key: `identity-documents/${application.id}/${doc.type.toLowerCase()}-${Date.now()}`,
        contentType: doc.mimeType,
        body: doc.buffer,
      });
      await tx.identityDocument.create({
        data: {
          foundingApplicationId: application.id,
          type: doc.type,
          storageProvider: storage.name,
          storageKey,
          mimeType: doc.mimeType,
        },
      });
    }

    const newStatus = advanceFoundingStatus(application.status, "IDENTITY_SUBMITTED");
    const updated = await tx.foundingApplication.update({
      where: { id: application.id },
      data: { status: newStatus },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "founding_application.identity_submitted",
        targetType: "founding_application",
        targetId: application.id,
        metadata: { documentTypes: documents.map((d) => d.type) },
      },
    });

    return updated;
  });

  return NextResponse.json({ status: result.status });
}
