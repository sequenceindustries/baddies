import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFeedPage } from "@/lib/discovery/public-feed";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * The single source of data for two different consumers, distinguished
 * by a `scope` query param — see getFeedPage's own doc comment
 * (src/lib/discovery/public-feed.ts) for the full `home` vs `discovery`
 * semantics, which this route now delegates to entirely. That same
 * function also backs /discovery's server-rendered first page directly
 * (src/app/discovery/page.tsx); this route serves every subsequent
 * page as the visitor scrolls, for both scopes.
 */
export async function GET(req: NextRequest) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const scope = req.nextUrl.searchParams.get("scope") === "discovery" ? "discovery" : "home";
  const viewer = await getCurrentUser();

  const result = await getFeedPage({ scope, cursor, viewer });
  return NextResponse.json(result);
}
