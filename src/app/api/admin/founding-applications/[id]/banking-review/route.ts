import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  status: z.enum(["EXTERNALLY_VERIFIED", "FAILED", "NEEDS_CORRECTION"]),
  externalVerificationRef: z.string().max(200).optional(),
  adminNotes: z.string().max(2000).optional(),
});

/**
 * Records the outcome of bank verification — the verification itself
 * stays external per MASTER REQUIREMENTS §3 ("Bank verification will
 * initially be handled EXTERNALLY. Do not build an advanced banking
 * verification system yet."), this route just captures the result.
 * Gated on "banking:view" — the same permission that already gates
 * reading banking data, reused for the write side too, matching how
 * "creator:verify" already covers both read and write for identity
 * review (see .../identity-review/route.ts).
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "banking:view");
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

  const banking = await db.banking.findUnique({ where: { foundingApplicationId: params.id } });
  if (!banking) {
    return NextResponse.json({ error: "No banking submission found for this application." }, { status: 404 });
  }

  const updated = await db.$transaction(async (tx) => {
    const result = await tx.banking.update({
      where: { foundingApplicationId: params.id },
      data: {
        status: parsed.data.status,
        externalVerificationRef: parsed.data.externalVerificationRef ?? banking.externalVerificationRef,
        adminNotes: parsed.data.adminNotes ?? banking.adminNotes,
        verifiedAt: parsed.data.status === "EXTERNALLY_VERIFIED" ? new Date() : banking.verifiedAt,
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_application.banking_reviewed",
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
