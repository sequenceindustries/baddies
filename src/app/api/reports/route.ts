import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * File a trust & safety report against a piece of content or a user.
 * Every report also opens a ModerationCase so it lands in an admin queue
 * — see build brief §23. Exactly one of contentId/reportedUserId must be
 * set; reporting a user directly (not tied to specific content) covers
 * cases like harassment via messages.
 */
const ReportSchema = z
  .object({
    contentId: z.string().min(1).optional(),
    reportedUserId: z.string().min(1).optional(),
    reason: z.enum([
      "NON_CONSENSUAL",
      "MINOR_SAFETY",
      "ILLEGAL_CONTENT",
      "IMPERSONATION",
      "HARASSMENT",
      "SPAM",
      "OTHER",
    ]),
    details: z.string().max(2000).optional(),
  })
  .refine((data) => Boolean(data.contentId) !== Boolean(data.reportedUserId), {
    message: "Provide exactly one of contentId or reportedUserId.",
  });

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "report:file");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { contentId, reportedUserId, reason, details } = parsed.data;

  if (contentId) {
    const content = await db.content.findUnique({ where: { id: contentId } });
    if (!content) {
      return NextResponse.json({ error: "Content not found." }, { status: 404 });
    }
  }

  const report = await db.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: { reporterId: user.id, contentId, reportedUserId, reason, details },
    });
    await tx.moderationCase.create({
      data: { contentId, reportId: created.id, status: "OPEN" },
    });
    return created;
  });

  return NextResponse.json({ reportId: report.id }, { status: 201 });
}
