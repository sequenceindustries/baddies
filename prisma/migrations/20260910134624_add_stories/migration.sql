-- Real, creator-uploaded ephemeral Stories — auto-expire 24h after
-- upload, no tier gating. Purely additive: one new table, no existing
-- table touched. Reuses the existing MediaType enum — no new enum
-- needed. See Story's own comment in prisma/schema.prisma for why this
-- is a flat table rather than a child of media_assets/content.
CREATE TABLE "stories" (
    "id" TEXT NOT NULL,
    "creatorProfileId" TEXT NOT NULL,
    "mediaType" "MediaType" NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "displayStorageKey" TEXT,
    "displayMimeType" TEXT,
    "displayWidth" INTEGER,
    "displayHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stories_creatorProfileId_expiresAt_idx" ON "stories"("creatorProfileId", "expiresAt");

CREATE INDEX "stories_expiresAt_createdAt_idx" ON "stories"("expiresAt", "createdAt");

ALTER TABLE "stories" ADD CONSTRAINT "stories_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "creator_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
