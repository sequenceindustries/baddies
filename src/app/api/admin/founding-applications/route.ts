import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { FoundingApplicationStatus } from "@prisma/client";

// Always dynamic: this route reads live data (DB, auth, or both) and
// must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Lists Founding Baddies campaign applications for admin review. Reuses
 * "creator:verify" (ADMIN-only) rather than a new permission — this is
 * the same kind of decision (does this person get to become a creator
 * on Baddies) one step earlier in the funnel.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "creator:verify");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const statusParam = req.nextUrl.searchParams.get("status") as FoundingApplicationStatus | null;

  const applications = await db.foundingApplication.findMany({
    where: statusParam ? { status: statusParam } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    applications: applications.map((a: (typeof applications)[number]) => ({
      id: a.id,
      fullName: a.fullName,
      stageName: a.stageName,
      email: a.email,
      phone: a.phone,
      country: a.country,
      city: a.city,
      platforms: a.platforms,
      audienceSize: a.audienceSize,
      monetisationExperience: a.monetisationExperience,
      creatingSince: a.creatingSince,
      currentlyMonetising: a.currentlyMonetising,
      whyJoinBaddies: a.whyJoinBaddies,
      status: a.status,
      adminNotes: a.adminNotes,
      createdAt: a.createdAt,
    })),
  });
}
