import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Lets /apply's VERIFICATION_REQUIRED screen know whether the current
 * creator has already submitted a capture (so it shows "awaiting review"
 * on reload instead of the camera UI again), without building a full
 * verification status page.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { userId: user.id },
    select: { verifications: { select: { type: true, status: true } } },
  });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator application found." }, { status: 404 });
  }

  const checks: Record<string, string> = {};
  for (const v of creatorProfile.verifications) {
    checks[v.type] = v.status;
  }

  return NextResponse.json({ checks });
}
