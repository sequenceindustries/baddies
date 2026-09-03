import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  status: z
    .enum(["OPEN", "IN_REVIEW", "ESCALATED", "UPHELD", "APPEALED", "RESOLVED", "DISMISSED"])
    .optional(),
  resolutionNotes: z.string().max(4000).nullable().optional(),
  assignToSelf: z.boolean().optional(),
});

/**
 * One flexible update endpoint for a moderation case — status,
 * resolution notes, and self-assignment can each be set independently
 * in one call. No dedicated state-machine file exists for
 * ModerationCaseStatus (unlike Content/Creator), so — same reasoning
 * as the Founding Applications queue's own status dropdown — this
 * trusts admin discretion over a fixed transition table.
 */
export async function PATCH(req: NextRequest, { params }: { params: { caseId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "report:review");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.moderationCase.findUnique({ where: { id: params.caseId } });
  if (!existing) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const { status, resolutionNotes, assignToSelf } = parsed.data;
  const isTerminal = status === "RESOLVED" || status === "DISMISSED";

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.moderationCase.update({
      where: { id: existing.id },
      data: {
        ...(status ? { status } : {}),
        ...(resolutionNotes !== undefined ? { resolutionNotes } : {}),
        ...(assignToSelf ? { assignedToAdminId: user.id } : {}),
        ...(isTerminal ? { resolvedAt: new Date() } : {}),
        ...(status === "APPEALED" ? { appealedAt: new Date() } : {}),
      },
    });

    if (status && status !== existing.status) {
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "moderation_case.status_change",
          targetType: "moderation_case",
          targetId: existing.id,
          metadata: { from: existing.status, to: status, resolutionNotes: resolutionNotes ?? undefined },
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    }
    if (assignToSelf) {
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "moderation_case.assign",
          targetType: "moderation_case",
          targetId: existing.id,
          ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
        },
      });
    }

    return result;
  });

  return NextResponse.json({ caseId: updated.id, status: updated.status, assignedToAdminId: updated.assignedToAdminId });
}
