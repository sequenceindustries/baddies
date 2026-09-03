import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma, UserRole } from "@prisma/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const ROLES: UserRole[] = ["FAN", "CREATOR", "ADMIN"];

/**
 * The Members tab's directory listing — search/filter/paginate every
 * user, replacing the old exact-email-only lookup box (still the
 * mechanism UserActionsPanel's suspend/ban buttons act on; this just
 * gives the admin a way to find someone without already knowing their
 * exact email). Cursor pagination, same shape as the audit log route.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "dashboard:view");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const params = req.nextUrl.searchParams;
  const query = params.get("query")?.trim();
  const roleParam = params.get("role");
  const role = roleParam && ROLES.includes(roleParam as UserRole) ? (roleParam as UserRole) : undefined;
  const statusParam = params.get("status"); // "active" | "suspended"
  const cursor = params.get("cursor") ?? undefined;

  const where: Prisma.UserWhereInput = {
    ...(role ? { role } : {}),
    ...(statusParam === "active" ? { isActive: true } : {}),
    ...(statusParam === "suspended" ? { isActive: false } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { profile: { displayName: { contains: query, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const rows = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { profile: { select: { displayName: true } }, creatorProfile: { select: { status: true } } },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  return NextResponse.json({
    users: page.map((u: (typeof page)[number]) => ({
      userId: u.id,
      email: u.email,
      role: u.role,
      displayName: u.profile?.displayName ?? null,
      isActive: u.isActive,
      suspendedAt: u.suspendedAt,
      creatorProfileStatus: u.creatorProfile?.status ?? null,
      createdAt: u.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
