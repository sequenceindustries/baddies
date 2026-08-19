import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getFanCountry, getNearbyCreators } from "@/lib/discovery/nearby";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/** "Baddies Near You" on the Discover page — same query /api/home uses for its own section (see src/lib/discovery/nearby.ts). */
export async function GET() {
  const user = await getCurrentUser();
  const fanCountry = await getFanCountry(user?.id);
  const creators = await getNearbyCreators(fanCountry);
  return NextResponse.json({ creators });
}
