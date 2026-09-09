import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const ResolveSchema = z.object({
  status: z.enum(["DISMISSED", "CONFIRMED"]),
  resolutionNotes: z.string().min(3, "Resolution notes are required.").max(2000),
});

/**
 * Resolves an abuse flag as DISMISSED (no real issue found) or
 * CONFIRMED (the flagged pattern was real). This route only records
 * the finding — it never takes any corrective action itself. A
 * CONFIRMED self-referral or duplicate-attribution flag, for example,
 * links into the already-built, already-audited referral-correction
 * flow (PATCH /api/admin/founding-applications/[id]/correct-attribution)
 * rather than this route trying to reverse anything on its own; a
 * CONFIRMED suspicious-refund/chargeback pattern is a signal for admin
 * to separately use the Commission Management reverse action if
 * warranted. Keeping this one purpose (recording the review outcome)
 * avoids this becoming a second place that also mutates commissions or
 * attributions.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  try {
    requirePermission(user.role, "founding_partner:manage");
  } catch (err) {
    if (err instanceof ForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = ResolveSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const flag = await db.abuseFlag.findUnique({ where: { id: params.id } });
  if (!flag) {
    return NextResponse.json({ error: "Flag not found." }, { status: 404 });
  }
  if (flag.status === "DISMISSED" || flag.status === "CONFIRMED") {
    return NextResponse.json({ error: `This flag is already resolved (${flag.status}).` }, { status: 409 });
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.abuseFlag.update({
      where: { id: flag.id },
      data: {
        status: parsed.data.status,
        resolutionNotes: parsed.data.resolutionNotes,
        reviewedBy: user.id,
        reviewedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "abuse_flag.resolved",
        targetType: "abuse_flag",
        targetId: flag.id,
        metadata: { status: parsed.data.status, resolutionNotes: parsed.data.resolutionNotes, flagType: flag.type },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return result;
  });

  return NextResponse.json({ id: updated.id, status: updated.status });
}
