import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT, type CreatorCard } from "@/lib/discovery/creator-card";

const RESULT_LIMIT = 30;

export interface CategoryWithCreators {
  slug: string;
  name: string;
  creators: CreatorCard[];
}

/**
 * SEO Phase 4 — extracted verbatim from GET /api/discovery/categories/
 * [slug]/route.ts (which now delegates here), so the server-rendered
 * category page (src/app/discovery/[slug]/page.tsx) and that route
 * share one implementation. No auth check before or after this
 * extraction — this was already safe to call for a signed-out visitor,
 * the page itself just refused to render for one.
 */
export async function getCategoryCreators(slug: string): Promise<CategoryWithCreators | null> {
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) {
    return null;
  }

  const links = await db.creatorCategory.findMany({
    where: { categoryId: category.id, creatorProfile: { status: "VERIFIED" } },
    take: RESULT_LIMIT,
    select: { creatorProfile: { select: CREATOR_CARD_SELECT } },
  });

  const creators = await Promise.all(links.map((l: (typeof links)[number]) => toCreatorCard(l.creatorProfile)));

  return { slug: category.slug, name: category.name, creators };
}
