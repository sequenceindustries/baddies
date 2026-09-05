import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { canMonetise } from "@/lib/creator/status";
import { assertContentTransition } from "@/lib/content/status";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Lists the current user's own content across every status (draft through
 * published), for the creator dashboard. Unlike the public
 * /api/creators/:id/content route, this deliberately includes everything —
 * a creator needs to see their DRAFT/PENDING_REVIEW/REJECTED items too, not
 * just what's live.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator profile found." }, { status: 404 });
  }

  const items = await db.content.findMany({
    where: { creatorProfileId: creatorProfile.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      mediaType: true,
      accessLevel: true,
      priceUsd: true,
      caption: true,
      status: true,
      moderationStatus: true,
      publishedAt: true,
      createdAt: true,
      _count: { select: { likes: true } },
    },
  });

  return NextResponse.json({
    items: items.map((item: (typeof items)[number]) => ({
      contentId: item.id,
      mediaType: item.mediaType,
      accessLevel: item.accessLevel,
      priceUsd: item.priceUsd,
      caption: item.caption,
      status: item.status,
      moderationStatus: item.moderationStatus,
      publishedAt: item.publishedAt,
      createdAt: item.createdAt,
      likeCount: item._count.likes,
    })),
  });
}

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
  // FREE/VIP/VVIP — see prisma/schema.prisma's ContentAccessLevel comment.
  // PPV is retired from the product and deliberately not accepted here,
  // even though the enum value still exists in the database.
  accessLevel: z.enum(["FREE", "VIP", "VVIP"]),
  caption: z.string().max(2000).optional(),
});

/**
 * Only VERIFIED creators can monetise (§6), but any creator profile can
 * still draft content — the monetise check is enforced specifically for
 * VIP/VVIP access levels, not for uploading in general, so a
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

  // Real verification gate — a creator can't publish anything (any access
  // level, not just VIP/VVIP) until they've at least submitted both
  // required evidence groups: identity+age (details + live photo, see
  // /api/creator/verification/identity-details and .../capture) and
  // liveness (recorded video). "Submitted" is enough — this doesn't wait
  // for admin approval — but a FAILED review re-blocks until they
  // resubmit, since FAILED means the evidence itself was rejected.
  const requiredSessions = await db.verificationSession.findMany({
    where: { creatorProfileId: creatorProfile.id, type: { in: ["IDENTITY", "LIVENESS"] } },
  });
  const isSubmitted = (type: "IDENTITY" | "LIVENESS") => {
    const session = requiredSessions.find((s: (typeof requiredSessions)[number]) => s.type === type);
    return !!session && session.status !== "FAILED";
  };
  if (!isSubmitted("IDENTITY") || !isSubmitted("LIVENESS")) {
    return NextResponse.json(
      { error: "Complete identity, age & liveness verification before uploading content." },
      { status: 403 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = UploadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { mediaType, mimeType, base64Data, accessLevel, caption } = parsed.data;

  if (accessLevel !== "FREE" && !canMonetise(creatorProfile.status)) {
    return NextResponse.json(
      { error: "Only verified creators can publish monetised (VIP/VVIP) content." },
      { status: 403 }
    );
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
        // No per-item pricing now that PPV is retired — VIP/VVIP content
        // is unlocked by subscription (see the entitlement engine), not
        // an individual price.
        priceUsd: null,
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

    // Product decision: uploads do not sit in an admin moderation queue —
    // a verified creator's content goes live the moment they publish it,
    // no waiting on approval. Walk the real state machine (see
    // src/lib/content/status.ts, which no longer routes the upload path
    // through PENDING_REVIEW) rather than just setting a status literal,
    // so an illegal jump would throw instead of silently drifting out of
    // sync with the one place those transitions are defined. Publish
    // immediately too (publishedAt set here, rather than requiring a
    // separate "Publish" click) so upload really does mean "it's live."
    // ContentStatus.PENDING_REVIEW and the admin approve/reject routes
    // (src/app/api/admin/content/*) are kept in place rather than
    // deleted — useful infrastructure if a moderation queue is ever
    // reintroduced (e.g. in response to reports), just nothing routes new
    // uploads through it today.
    assertContentTransition("DRAFT", "UPLOADED");
    assertContentTransition("UPLOADED", "PROCESSING");
    assertContentTransition("PROCESSING", "APPROVED");
    const updatedContent = await tx.content.update({
      where: { id: createdContent.id },
      data: { status: "APPROVED", moderationStatus: "APPROVED", publishedAt: new Date() },
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
