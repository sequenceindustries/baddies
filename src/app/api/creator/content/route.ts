import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { canMonetise } from "@/lib/creator/status";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Sprint 0/1/2 note on the upload transport: this route accepts base64-
 * encoded bytes in a JSON body for simplicity. A production upload flow
 * should switch to direct-to-storage signed PUT URLs (client uploads
 * straight to the storage provider, this route only records metadata)
 * once real file sizes make base64-over-JSON impractical — the
 * MediaStorageProvider interface already supports adding a
 * `getSignedUploadUrl` method for that without changing call sites
 * elsewhere.
 */
const UploadSchema = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO", "AUDIO"]),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
  accessLevel: z.enum(["PUBLIC_PREVIEW", "ENTRY", "VIP", "PPV"]),
  priceUsd: z.number().positive().optional(),
  caption: z.string().max(2000).optional(),
});

/**
 * Only VERIFIED creators can monetise (§6), but any creator profile can
 * still draft content — the monetise check is enforced specifically for
 * PPV/paid access levels, not for uploading in general, so a
 * newly-applying creator isn't blocked from preparing content while
 * awaiting approval.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "content:create");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const creatorProfile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = UploadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { mediaType, mimeType, base64Data, accessLevel, priceUsd, caption } = parsed.data;

  if (accessLevel !== "PUBLIC_PREVIEW" && !canMonetise(creatorProfile.status)) {
    return NextResponse.json(
      { error: "Only verified creators can publish monetised (Entry/VIP/PPV) content." },
      { status: 403 }
    );
  }

  if (accessLevel === "PPV" && !priceUsd) {
    return NextResponse.json({ error: "priceUsd is required for PPV content." }, { status: 400 });
  }

  const storage = getMediaStorageProvider();
  const buffer = Buffer.from(base64Data, "base64");
  const MAX_BYTES = 500 * 1024 * 1024; // 500MB — placeholder ceiling, revisit per media type in Sprint 2 hardening
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds maximum allowed size." }, { status: 413 });
  }

  const { content, mediaAsset } = await db.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
    const createdContent = await tx.content.create({
      data: {
        creatorProfileId: creatorProfile.id,
        mediaType,
        accessLevel,
        priceUsd: priceUsd ?? null,
        caption,
        status: "DRAFT",
        moderationStatus: "DRAFT",
      },
    });

    const upload = await storage.putObject({
      key: `creators/${creatorProfile.id}/content/${createdContent.id}`,
      contentType: mimeType,
      body: buffer,
    });

    const createdAsset = await tx.mediaAsset.create({
      data: {
        contentId: createdContent.id,
        storageProvider: storage.name,
        storageKey: upload.storageKey,
        mimeType,
        byteSize: buffer.byteLength,
      },
    });

    // Sprint 2 has no real async transcoding/moderation pipeline yet, so
    // we advance synchronously through UPLOADED → PROCESSING →
    // PENDING_REVIEW. A real pipeline (thumbnailing, transcoding, CSAM/
    // hash-matching scan, NSFW classification) should replace this block
    // with a queued job that lands the content in PENDING_REVIEW only
    // once those checks are complete — see build brief §10.
    const updatedContent = await tx.content.update({
      where: { id: createdContent.id },
      data: { status: "PENDING_REVIEW", moderationStatus: "PENDING_REVIEW" },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "content.upload",
        targetType: "content",
        targetId: createdContent.id,
      },
    });

    return { content: updatedContent, mediaAsset: createdAsset };
  });

  return NextResponse.json(
    {
      contentId: content.id,
      status: content.status,
      mediaAssetId: mediaAsset.id,
    },
    { status: 201 }
  );
}
