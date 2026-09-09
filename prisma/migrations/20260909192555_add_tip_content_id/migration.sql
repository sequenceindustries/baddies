-- Social-feed redesign: lets a Tip optionally attach to a specific
-- piece of Content, so a post's tip count/list can be a real query
-- instead of fabricated. Fully additive — nullable column, SetNull on
-- delete (removing the content a tip was attached to must never
-- delete the financial record of the tip itself). Every existing tips
-- row simply gets contentId = NULL (a plain creator-level gift, the
-- only kind this model supported before today).

-- AlterTable
ALTER TABLE "tips" ADD COLUMN     "contentId" TEXT;

-- CreateIndex
CREATE INDEX "tips_contentId_idx" ON "tips"("contentId");

-- AddForeignKey
ALTER TABLE "tips" ADD CONSTRAINT "tips_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "content"("id") ON DELETE SET NULL ON UPDATE CASCADE;
