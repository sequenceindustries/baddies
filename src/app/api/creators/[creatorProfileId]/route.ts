import { NextRequest, NextResponse } from "next/server";
import { getPublicCreatorProfile } from "@/lib/creator/public-profile";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Public creator profile (§12). Delegates entirely to
 * getPublicCreatorProfile (src/lib/creator/public-profile.ts) — the
 * same function that now also backs the server-rendered profile page
 * directly (src/app/creators/[creatorProfileId]/page.tsx), so this
 * route and that page can never drift out of sync. Response shape is
 * unchanged from before that extraction (see that module's own doc
 * comment for the full behavior: 404s a non-existent or non-VERIFIED
 * creator without distinguishing why, respects every privacy toggle
 * server-side, resolves by id or handle).
 */
export async function GET(_req: NextRequest, { params }: { params: { creatorProfileId: string } }) {
  const creator = await getPublicCreatorProfile(params.creatorProfileId);

  if (!creator) {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  return NextResponse.json(creator);
}
