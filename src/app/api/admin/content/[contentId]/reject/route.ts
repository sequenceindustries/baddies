import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { assertContentTransition, InvalidContentTransitionError } from "@/lib/content/status";

const RejectSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { contentId: string } }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "content:moderate");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const json = await req.json().catch(() => null);
  const parsed = RejectSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const content = await db.content.findUnique({ where: { id: params.contentId } });
  if (!content) {
    return NextResponse.json({ error: "Content not found." }, { status: 404 });
  }

  try {
    assertContentTransition(content.status, "REJECTED");
  } catch (err) {
    if (err instanceof InvalidContentTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const updated = await db.$transaction(async (tx: import("@prisma/client").Prisma.TransactionClient) => {
    const result = await tx.content.update({
      where: { id: content.id },
      data: { status: "REJECTED", moderationStatus: "REJECTED" },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "content.reject",
        targetType: "content",
        targetId: content.id,
        metadata: { reason: parsed.data.reason },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return result;
  });

  return NextResponse.json({ contentId: updated.id, status: updated.status });
}
