import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

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
