import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data (DB, auth).
export const dynamic = "force-dynamic";

/**
 * Admin abuse-flag review queue — narrow, rule-based flags only (see
 * AbuseFlag's own schema comment), e.g. the MANUAL_REVIEW flag the
 * payment webhook writes for a mismatched amount/currency. General fake
 * accounts or fraud elsewhere on the platform stay the existing
 * Report/moderation system's job, not duplicated here.
 *
 * Defaults to `?status=OPEN` (the actual queue an admin needs to work)
 * — pass `?status=` (empty) for every status, or a specific one.
 * `?type=` narrows further.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "report:review");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const status = statusParam === null ? "OPEN" : statusParam;
  const type = searchParams.get("type");

  const flags = await db.abuseFlag.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(type ? { type: type as never } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    flags: flags.map((f: (typeof flags)[number]) => ({
      id: f.id,
      type: f.type,
      status: f.status,
      reason: f.reason,
      autoDetected: f.autoDetected,
      reviewedBy: f.reviewedBy,
      reviewedAt: f.reviewedAt,
      resolutionNotes: f.resolutionNotes,
      createdAt: f.createdAt,
    })),
  });
}
