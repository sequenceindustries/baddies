import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

/**
 * Admin-only view of the append-only AuditLog (§23: "Every sensitive
 * admin action should be logged."). Read-only — nothing here may ever
 * update or delete a row, matching the ledger's own append-only rule.
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "audit:view");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const cursor = req.nextUrl.searchParams.get("cursor") ?? undefined;

  const entries = await db.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: { actor: { select: { email: true } } },
  });

  const hasMore = entries.length > PAGE_SIZE;
  const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

  return NextResponse.json({
    entries: page.map((e: (typeof page)[number]) => ({
      id: e.id,
      action: e.action,
      actorEmail: e.actor?.email ?? null,
      targetType: e.targetType,
      targetId: e.targetId,
      createdAt: e.createdAt,
    })),
    nextCursor: hasMore ? page[page.length - 1]?.id : null,
  });
}
