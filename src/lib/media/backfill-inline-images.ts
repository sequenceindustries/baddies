import type { PrismaClient } from "@prisma/client";
import { persistPublicImage } from "@/lib/media/persist-public-image";

/**
 * One-pass cleanup for avatar/cover values saved as raw `data:` URLs
 * before uploads were routed through persistPublicImage — each one is
 * uploaded to storage and the column swapped for its short URL. Runs
 * from prisma/seed.ts on every deploy; once nothing is left inline it's
 * two cheap empty queries.
 */
export async function backfillInlinePublicImages(db: PrismaClient): Promise<number> {
  let converted = 0;

  const profiles = await db.profile.findMany({
    where: { avatarUrl: { startsWith: "data:" } },
    select: { userId: true, avatarUrl: true },
  });
  for (const p of profiles) {
    const url = await persistPublicImage(p.avatarUrl, `public/avatars/${p.userId}`);
    await db.profile.update({ where: { userId: p.userId }, data: { avatarUrl: url } });
    converted++;
  }

  const creators = await db.creatorProfile.findMany({
    where: { coverImageUrl: { startsWith: "data:" } },
    select: { id: true, coverImageUrl: true },
  });
  for (const c of creators) {
    const url = await persistPublicImage(c.coverImageUrl, `public/covers/${c.id}`);
    await db.creatorProfile.update({ where: { id: c.id }, data: { coverImageUrl: url } });
    converted++;
  }

  return converted;
}
