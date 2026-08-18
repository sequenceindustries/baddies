import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { assertTransition, InvalidTransitionError } from "@/lib/creator/status";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const RejectSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { creatorProfileId: string } }
) {
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

  const json = await req.json().catch(() => null);
  const parsed = RejectSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const creatorProfile = await db.creatorProfile.findUnique({
    where: { id: params.creatorProfileId },
  });
  if (!creatorProfile) {
    return NextResponse.json({ error: "Creator profile not found." }, { status: 404 });
  }

  try {
    assertTransition(creatorProfile.status, "REJECTED");
  } catch (err) {
    if (err instanceof InvalidTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    throw err;
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.creatorProfile.update({
      where: { id: creatorProfile.id },
      data: { status: "REJECTED" },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "creator.reject",
        targetType: "creator_profile",
        targetId: creatorProfile.id,
        metadata: { reason: parsed.data.reason },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });

    return result;
  });

  return NextResponse.json({ creatorProfileId: updated.id, status: updated.status });
}
