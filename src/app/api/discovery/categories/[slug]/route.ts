import { NextRequest, NextResponse } from "next/server";
import { getCategoryCreators } from "@/lib/discovery/categories";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Delegates to getCategoryCreators (src/lib/discovery/categories.ts) —
 * the same function that now also backs the server-rendered category
 * page directly (src/app/discovery/[slug]/page.tsx). Response shape
 * unchanged.
 */
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const result = await getCategoryCreators(params.slug);
  if (!result) {
    return NextResponse.json({ error: "Category not found." }, { status: 404 });
  }
  return NextResponse.json({ category: { slug: result.slug, name: result.name }, creators: result.creators });
}
