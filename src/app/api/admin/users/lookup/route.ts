import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/** Admin lookup of any user by exact email, to drive suspend/ban actions. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "user:suspend");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const email = req.nextUrl.searchParams.get("email")?.trim();
  if (!email) {
    return NextResponse.json({ error: "Query parameter 'email' is required." }, { status: 400 });
  }

  const found = await db.user.findUnique({
    where: { email },
    include: { profile: true, creatorProfile: true },
  });
  if (!found) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({
    userId: found.id,
    email: found.email,
    role: found.role,
    displayName: found.profile?.displayName ?? null,
    isActive: found.isActive,
    suspendedAt: found.suspendedAt,
    creatorProfileStatus: found.creatorProfile?.status ?? null,
  });
}
