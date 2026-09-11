import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";
import { DUMMY_CREATORS } from "@/lib/founding/dummy-creators";

// Always dynamic: this route mutates live production data and must
// never be statically prerendered or cached.
export const dynamic = "force-dynamic";

// Same "type the exact phrase" second-step pattern as
// reset-founding-roster — see that route's own doc comment for why a
// single click is deliberately not enough for anything this codebase
// treats as production-destructive.
const CONFIRM_PHRASE = "WIPE TEST CONTENT";

const WipeSchema = z.object({ confirm: z.literal(CONFIRM_PHRASE) });

const LOGO_PATH = path.join(process.cwd(), "public", "baddies-wordmark-white.webp");
const LOGO_CONTENT_TYPE = "image/webp";
// The real, known dimensions of that file (matches the width/height
// already hardcoded everywhere else it's rendered via next/image — see
// src/components/ui.tsx's Nav). Written onto every overwritten
// MediaAsset row so its stored metadata stays accurate, not just its
// bytes.
const LOGO_WIDTH = 2000;
const LOGO_HEIGHT = 462;

/**
 * Overwrites the stored image bytes of every IMAGE-type Content post
 * belonging to a non-official-demo creator with this app's own brand
 * wordmark — built for one specific, explicitly confirmed request:
 * production currently has a handful of stray test/E2E creator accounts
 * (generic names like "creator 7", not the 5 real, deliberately curated
 * DUMMY_CREATORS roster) whose posted photos the account owner wants
 * gone from view, without deleting the accounts themselves (see
 * reset-founding-roster for the "delete the accounts entirely" version
 * of this same cleanup — deliberately not used here, by direct request).
 *
 * Scope, deliberately narrow:
 *   - mediaType: IMAGE only. Video/audio posts are left completely
 *     untouched — there's no sensible way to "replace" a video file
 *     with a static logo image without breaking playback, and nothing
 *     in the request asked for that; this only ever came up over an
 *     actually-posted photo.
 *   - creator scope: every Content row whose owning CreatorProfile's
 *     User.email is NOT one of the 5 DUMMY_CREATORS emails — the exact
 *     same "official roster" test already used by reset-founding-roster
 *     and the (production-disabled) seed-script stray-creator cleanup,
 *     so a real Founding Baddie who has genuinely signed up (recruitment
 *     is live pre-launch — see /founding-baddies) is never touched by
 *     this, only the 5 official demo creators are protected from it.
 *
 * What actually changes: every MediaAsset row (both ORIGINAL and any
 * DISPLAY variant) belonging to an in-scope Content row gets its
 * underlying stored bytes overwritten in place, via
 * MediaStorageProvider.putObject with that asset's own existing
 * storageKey — so this works correctly whether the active provider is
 * the DB-backed stub (today) or a real object-storage provider, with no
 * separate cleanup step and no dangling old file left behind under a
 * different key. width/height/mimeType on the MediaAsset row are
 * updated to match the logo file so stored metadata stays truthful.
 * Content.caption, accessLevel, publishedAt, etc. are untouched — only
 * the image itself changes.
 *
 * This does NOT delete anything — the Content/MediaAsset rows, the
 * creator accounts, and their other data all still exist exactly as
 * before. It's still irreversible in the sense that the original
 * uploaded photo bytes are gone (there's no undo), which is why this
 * gets the same confirm-phrase treatment as reset-founding-roster.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "system:wipe_test_content");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = WipeSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Type the exact phrase "${CONFIRM_PHRASE}" to confirm.` },
      { status: 400 }
    );
  }

  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;
  const logoBytes = await fs.readFile(LOGO_PATH);
  const storage = getMediaStorageProvider();
  const dummyEmails = DUMMY_CREATORS.map((c) => c.email);

  const targetContent = await db.content.findMany({
    where: {
      mediaType: "IMAGE",
      creatorProfile: { user: { email: { notIn: dummyEmails } } },
    },
    select: {
      id: true,
      creatorProfileId: true,
      mediaAssets: { select: { id: true, storageKey: true } },
    },
  });

  let mediaAssetsReplaced = 0;
  for (const content of targetContent) {
    for (const asset of content.mediaAssets) {
      await storage.putObject({ key: asset.storageKey, contentType: LOGO_CONTENT_TYPE, body: logoBytes });
      await db.mediaAsset.update({
        where: { id: asset.id },
        data: { mimeType: LOGO_CONTENT_TYPE, width: LOGO_WIDTH, height: LOGO_HEIGHT, byteSize: logoBytes.length },
      });
      mediaAssetsReplaced += 1;
    }
  }

  const creatorsAffected = new Set(targetContent.map((c) => c.creatorProfileId)).size;

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "system.wipe_test_content",
      targetType: "system",
      targetId: "test_content_images",
      metadata: {
        contentAffected: targetContent.length,
        mediaAssetsReplaced,
        creatorsAffected,
      },
      ipAddress,
    },
  });

  return NextResponse.json({
    contentAffected: targetContent.length,
    mediaAssetsReplaced,
    creatorsAffected,
  });
}
