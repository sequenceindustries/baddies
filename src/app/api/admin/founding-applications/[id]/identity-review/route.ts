import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  status: z.enum(["VERIFIED", "FAILED", "REJECTED"]),
  failureReason: z.string().max(2000).optional(),
});

/**
 * Reviews the *Identity* sub-record only (legal name/DOB/ID number/
 * documents) — deliberately does NOT touch the overall
 * FoundingApplicationStatus pipeline, which stays the admin's separate,
 * manual dropdown call (see FoundingApplicationsQueue). Keeping this
 * bounded avoids two mechanisms racing to decide the same field; an
 * admin who's satisfied with identity review can still advance the
 * overall stage themselves via the dropdown, informed by this result.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const identity = await db.identity.findUnique({ where: { foundingApplicationId: params.id } });
  if (!identity) {
    return NextResponse.json({ error: "No identity submission found for this application." }, { status: 404 });
  }

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const result = await tx.identity.update({
      where: { foundingApplicationId: params.id },
      data: {
        status: parsed.data.status,
        reviewedBy: user.id,
        reviewedAt: new Date(),
        failureReason: parsed.data.status === "VERIFIED" ? null : (parsed.data.failureReason ?? null),
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_application.identity_reviewed",
        targetType: "founding_application",
        targetId: params.id,
        metadata: { status: parsed.data.status },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return result;
  });

  return NextResponse.json({ status: updated.status });
}
