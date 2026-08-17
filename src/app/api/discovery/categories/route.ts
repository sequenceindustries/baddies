import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { name: "asc" },
    select: { id: true, slug: true, name: true, _count: { select: { creators: true } } },
  });

  return NextResponse.json({
    categories: categories.map((c: (typeof categories)[number]) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      creatorCount: c._count.creators,
    })),
  });
}
