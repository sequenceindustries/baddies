import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";
import { generateDisplayVariant, getImageDimensions } from "@/lib/media/image-pipeline";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const STORY_TTL_MS = 24 * 60 * 60 * 1000;

// No AUDIO — a story is a visual thing, nothing in the feature request
// implies audio stories. No accessLevel/caption either — stories are
// deliberately untiered ("not to be put on any tier") and don't carry
// the tier/caption UI Content does.
const StoryUploadSchema = z.object({
  mediaType: z.enum(["IMAGE", "VIDEO"]),
  mimeType: z.string().min(1),
  base64Data: z.string().min(1),
});

/**
 * Real, creator-uploaded ephemeral story — disappears 24h after upload,
 * visible to every signed-in viewer regardless of subscription tier
 * (see GET /api/stories and /api/stories/:creatorProfileId, which run
 * zero entitlement checks). Reuses api/creator/content/route.ts's
 * proven auth/verification/size/image-validation/storage pieces
 * directly (same trust bar — a story is still creator-published
 * content) but skips everything Content-specific: no accessLevel, no
 * ContentStatus state machine, no $transaction (a single flat row with
 * no multi-step invariant to protect).
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

  // Same real verification gate as content upload — a story is still
  // creator-published content, same trust bar applies.
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
  const parsed = StoryUploadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { mediaType, mimeType, base64Data } = parsed.data;

  const storage = getMediaStorageProvider();
  const buffer = Buffer.from(base64Data, "base64");
  const MAX_BYTES = 100 * 1024 * 1024; // 100MB per file — same cap as content upload
  if (buffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds maximum allowed size." }, { status: 413 });
  }

  let imageDims: { width: number; height: number } | null = null;
  if (mediaType === "IMAGE") {
    imageDims = await getImageDimensions(buffer);
    if (!imageDims) {
      return NextResponse.json({ error: "Uploaded file is not a valid image." }, { status: 400 });
    }
  }

  // Storage key is generated up front (unlike Content, which embeds its
  // own DB id in the key after creating the row) — Story is a flat row
  // whose storageKey is set at creation, before it has an id. Mirrors
  // persist-public-image.ts's own `${prefix}/${Date.now()}-${uuid}`
  // convention for exactly this "no parent id yet" situation.
  const key = `creators/${creatorProfile.id}/stories/${Date.now()}-${crypto.randomUUID()}`;
  const upload = await storage.putObject({ key, contentType: mimeType, body: buffer });

  let display: Awaited<ReturnType<typeof generateDisplayVariant>> = null;
  let displayStorageKey: string | undefined;
  if (mediaType === "IMAGE") {
    display = await generateDisplayVariant(buffer);
    if (display) {
      const displayUpload = await storage.putObject({
        key: `${upload.storageKey}-display`,
        contentType: display.mimeType,
        body: display.buffer,
      });
      displayStorageKey = displayUpload.storageKey;
    }
  }

  const now = new Date();
  const story = await db.story.create({
    data: {
      creatorProfileId: creatorProfile.id,
      mediaType,
      storageProvider: storage.name,
      storageKey: upload.storageKey,
      mimeType,
      width: imageDims?.width,
      height: imageDims?.height,
      displayStorageKey,
      displayMimeType: display?.mimeType,
      displayWidth: display?.width,
      displayHeight: display?.height,
      createdAt: now,
      expiresAt: new Date(now.getTime() + STORY_TTL_MS),
    },
  });

  await db.auditLog.create({
    data: { actorId: user.id, action: "story.upload", targetType: "story", targetId: story.id },
  });

  return NextResponse.json({ storyId: story.id, expiresAt: story.expiresAt }, { status: 201 });
}
