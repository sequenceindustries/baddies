-- Backing store for the stub MediaStorageProvider (see
-- src/lib/providers/storage/stub.ts) — additive, new table only.
CREATE TABLE "media_blobs" (
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_blobs_pkey" PRIMARY KEY ("storageKey")
);
