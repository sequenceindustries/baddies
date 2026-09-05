import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Lets the VerificationFlow wizard (used on /apply and creator-dashboard)
 * know which of its 3 steps are already done, so it shows the right step
 * (and an "awaiting review" state for later steps) instead of always
 * starting from step 1.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { userId: user.id },
    select: {
      verifications: { select: { type: true, status: true } },
      identity: { select: { id: true } },
    },
  });
  if (!creatorProfile) {
    return NextResponse.json({ error: "No creator application found." }, { status: 404 });
  }

  const checks: Record<string, string> = {};
  for (const v of creatorProfile.verifications) {
    checks[v.type] = v.status;
  }

  return NextResponse.json({ detailsSubmitted: creatorProfile.identity !== null, checks });
}
