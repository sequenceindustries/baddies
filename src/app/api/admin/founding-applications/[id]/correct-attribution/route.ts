import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const CorrectAttributionSchema = z.object({
  // null/omitted clears attribution entirely (e.g. the original link
  // click was fraudulent or mistaken); a string reassigns to that partner.
  foundingPartnerId: z.string().min(1).nullable().optional(),
  reason: z.string().min(1).max(2000),
});

/**
 * The only way ReferralAttribution ever changes after the automatic,
 * at-application-time write in POST /api/founding/apply — always
 * requires a reason, and always writes an AuditLog with the before/after
 * state, so this table is never the sole record of a correction (see
 * ReferralAttribution's own schema comment).
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
  const parsed = CorrectAttributionSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { foundingPartnerId, reason } = parsed.data;

  const application = await db.foundingApplication.findUnique({
    where: { id: params.id },
    include: { referralAttribution: true },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (foundingPartnerId) {
    const partner = await db.foundingPartner.findUnique({ where: { id: foundingPartnerId } });
    if (!partner) {
      return NextResponse.json({ error: "Founding Partner not found." }, { status: 404 });
    }
  }

  const previousPartnerId = application.referralAttribution?.foundingPartnerId ?? null;
  if (previousPartnerId === (foundingPartnerId ?? null)) {
    return NextResponse.json({ error: "No change — this application is already attributed as requested." }, { status: 409 });
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    if (foundingPartnerId) {
      await tx.referralAttribution.upsert({
        where: { foundingApplicationId: application.id },
        create: {
          foundingApplicationId: application.id,
          foundingPartnerId,
          correctedBy: user.id,
          correctedAt: new Date(),
          correctionReason: reason,
        },
        update: {
          foundingPartnerId,
          correctedBy: user.id,
          correctedAt: new Date(),
          correctionReason: reason,
        },
      });
    } else if (application.referralAttribution) {
      await tx.referralAttribution.delete({ where: { foundingApplicationId: application.id } });
    }

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_application.attribution_corrected",
        targetType: "founding_application",
        targetId: application.id,
        metadata: { from: previousPartnerId, to: foundingPartnerId ?? null, reason },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
  });

  return NextResponse.json({ foundingApplicationId: application.id, foundingPartnerId: foundingPartnerId ?? null });
}
