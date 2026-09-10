-- Additive, non-nullable with a default — safe against the existing
-- non-empty "content" table (every existing row gets viewCount = 0,
-- an honest starting point since no views were ever counted before
-- this column existed).
ALTER TABLE "content" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
