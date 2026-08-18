import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { toCreatorCard, CREATOR_CARD_SELECT } from "@/lib/discovery/creator-card";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RESULT_LIMIT = 30;

export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
) {
  const category = await db.category.findUnique({ where: { slug: params.slug } });
  if (!category) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }

  const links = await db.creatorCategory.findMany({
    where: { categoryId: category.id, creatorProfile: { status: "VERIFIED" } },
    take: RESULT_LIMIT,
    select: { creatorProfile: { select: CREATOR_CARD_SELECT } },
  });

  const cards = await Promise.all(links.map((l: (typeof links)[number]) => toCreatorCard(l.creatorProfile)));

  return NextResponse.json({ category: { slug: category.slug, name: category.name }, creators: cards });
}
