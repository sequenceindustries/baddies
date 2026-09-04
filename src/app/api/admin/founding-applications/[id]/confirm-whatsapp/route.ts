import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { advanceFoundingStatus } from "@/lib/founding/pipeline";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

/**
 * V1's WhatsApp "verification" is manual by design (see
 * src/lib/providers/whatsapp/ — no paid Business API integration yet):
 * the applicant messages a known number via a click-to-chat link, and an
 * admin confirms here once the message actually arrives. Same template
 * as every other admin action (src/app/api/admin/creators/[id]/approve/route.ts):
 * resolve user -> requirePermission -> state change -> AuditLog.
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

  const application = await db.foundingApplication.findUnique({
    where: { id: params.id },
    include: { contact: true },
  });
  if (!application || !application.contact) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const bothVerified = application.contact.emailVerifiedAt !== null;
  const newStatus = bothVerified
    ? advanceFoundingStatus(application.status, "CONTACT_CONFIRMED")
    : application.status;

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.contact.update({
      where: { foundingApplicationId: application.id },
      data: { whatsappVerifiedAt: new Date(), whatsappVerifiedBy: user.id },
    });
    const app = await tx.foundingApplication.update({
      where: { id: application.id },
      data: { status: newStatus },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_application.whatsapp_confirmed",
        targetType: "founding_application",
        targetId: application.id,
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return app;
  });

  return NextResponse.json({ status: updated.status });
}
