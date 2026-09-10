-- Creator-profile "..." menu Block action. Purely additive: one new
-- table, no existing table touched. blockerId/blockedUserId are both
-- plain User FKs (either party can be either role - the viewer blocks
-- the profile owner from the profile page's own menu, but enforcement
-- checks both directions, see POST /api/creators/:id/message and
-- .../follow).
CREATE TABLE "blocks" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blocks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "blocks_blockerId_blockedUserId_key" ON "blocks"("blockerId", "blockedUserId");

CREATE INDEX "blocks_blockerId_idx" ON "blocks"("blockerId");

CREATE INDEX "blocks_blockedUserId_idx" ON "blocks"("blockedUserId");

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blockedUserId_fkey" FOREIGN KEY ("blockedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
