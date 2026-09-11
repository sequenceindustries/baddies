import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getCreatorPublicContentPage } from "@/lib/creator/public-content";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * A creator's own feed. Delegates to getCreatorPublicContentPage
 * (src/lib/creator/public-content.ts) — the same function that now
 * also backs the server-rendered profile page's first content page
 * directly (src/app/creators/[creatorProfileId]/page.tsx), which
 * fetches subsequent pages from this route as the visitor scrolls.
 * Response shape and behavior are unchanged from before that
 * extraction — see that module's own doc comment.
 */
export async function GET(req: NextRequest, { params }: { params: { creatorProfileId: string } }) {
  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;
  const viewer = await getCurrentUser();

  const result = await getCreatorPublicContentPage({ creatorProfileId: params.creatorProfileId, cursor, viewer });
  if (!result) {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  return NextResponse.json(result);
}
