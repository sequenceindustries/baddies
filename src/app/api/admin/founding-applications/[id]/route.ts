import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can, requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { FOUNDING_STATUSES } from "@/lib/founding/status";
import { sendOnboardingApprovedEmail } from "@/lib/notifications/onboarding-approved";
import { decryptField } from "@/lib/security/field-encryption";
import { maskAccountNumber } from "@/lib/security/mask";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const UpdateSchema = z.object({
  status: z.enum(FOUNDING_STATUSES),
  adminNotes: z.string().max(4000).nullable().optional(),
});

/**
 * The Admin Creator Detail view's one call — a single Founding Baddie's
 * full picture. Same spirit as members/[userId]/route.ts: everything
 * that hangs directly off the application, plus a runtime email lookup
 * for a real matching User/CreatorProfile (no FK exists either
 * direction — see the schema's own comment on FoundingApplication for
 * why: an applicant has no User row until real launch), plus the audit
 * trail. See the plan file for why this is a FoundingApplication detail
 * view and not a CreatorProfile one: every identity/contact/location/
 * banking/agreement field only ever gets written here.
 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
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
    include: {
      identity: true,
      contact: true,
      location: true,
      banking: true,
      documents: true,
      agreementAcceptances: { include: { agreement: true } },
    },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const canViewBanking = can(user.role, "banking:view");
  const storage = getMediaStorageProvider();

  const linkedUser = await db.user.findFirst({
    where: { email: application.email },
    include: { creatorProfile: true },
  });
  const creatorProfileId = linkedUser?.creatorProfile?.id ?? null;

  const [contentCount, activeSubscribers, revenueSum, activity] = await Promise.all([
    creatorProfileId ? db.content.count({ where: { creatorProfileId } }) : Promise.resolve(0),
    creatorProfileId ? db.subscription.count({ where: { creatorProfileId, status: "ACTIVE" } }) : Promise.resolve(0),
    creatorProfileId
      ? db.ledgerEntry.aggregate({ where: { creatorProfileId }, _sum: { creatorShareAmount: true } })
      : Promise.resolve(null),
    db.auditLog.findMany({
      where: { targetId: application.id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { actor: { select: { email: true } } },
    }),
  ]);

  return NextResponse.json({
    id: application.id,
    fullName: application.fullName,
    stageName: application.stageName,
    email: application.email,
    phone: application.phone,
    country: application.country,
    city: application.city,
    platforms: application.platforms,
    audienceSize: application.audienceSize,
    monetisationExperience: application.monetisationExperience,
    creatingSince: application.creatingSince,
    currentlyMonetising: application.currentlyMonetising,
    status: application.status,
    adminNotes: application.adminNotes,
    createdAt: application.createdAt,

    identity: application.identity
      ? {
          legalName: application.identity.legalName,
          dateOfBirth: application.identity.dateOfBirth,
          nationality: application.identity.nationality,
          maskedIdNumber: maskAccountNumber(decryptField(application.identity.idNumberEncrypted)),
          status: application.identity.status,
          submittedAt: application.identity.submittedAt,
          reviewedAt: application.identity.reviewedAt,
          failureReason: application.identity.failureReason,
        }
      : null,
    contact: application.contact
      ? {
          emailVerified: application.contact.emailVerifiedAt !== null,
          emailVerifiedAt: application.contact.emailVerifiedAt,
          whatsappVerified: application.contact.whatsappVerifiedAt !== null,
          whatsappVerifiedAt: application.contact.whatsappVerifiedAt,
        }
      : null,
    location: application.location
      ? {
          status: application.location.status,
          detectedCountry: application.location.detectedCountry,
          detectionSignal: application.location.detectionSignal,
          detectionTimestamp: application.location.detectionTimestamp,
          rejectionReason: application.location.rejectionReason,
        }
      : null,
    banking:
      application.banking && canViewBanking
        ? {
            status: application.banking.status,
            bankName: application.banking.bankName,
            accountHolderName: application.banking.accountHolderName,
            maskedAccountNumber: maskAccountNumber(decryptField(application.banking.accountNumberEncrypted)),
            accountType: application.banking.accountType,
            branchCode: application.banking.branchCode,
            externalVerificationRef: application.banking.externalVerificationRef,
            verifiedAt: application.banking.verifiedAt,
          }
        : null,
    identityDocuments: await Promise.all(
      application.documents.map(async (d) => ({
        id: d.id,
        type: d.type,
        status: d.status,
        uploadedAt: d.uploadedAt,
        signedUrl: await storage.getSignedReadUrl(d.storageKey),
      }))
    ),
    agreements: application.agreementAcceptances.map((acc) => ({
      type: acc.agreement.type,
      version: acc.agreement.version,
      title: acc.agreement.title,
      bodyText: acc.agreement.bodyText,
      acceptedAt: acc.acceptedAt,
    })),

    linkedAccount: creatorProfileId
      ? {
          userId: linkedUser!.id,
          contentCount,
          activeSubscribers,
          revenueUsd: (revenueSum?._sum.creatorShareAmount ? Number(revenueSum._sum.creatorShareAmount) : 0).toFixed(2),
          creatorProfileId,
        }
      : null,

    activity: activity.map((a) => ({
      id: a.id,
      action: a.action,
      actorEmail: a.actor?.email ?? "system",
      createdAt: a.createdAt,
    })),
  });
}

/**
 * Moves a Founding Baddies application through its pipeline (see
 * FoundingApplicationStatus). One generic status-update endpoint rather
 * than a separate route per transition (approve/reject/etc.) — there
 * are 8 statuses here, not just two, so a fixed "next status" picker in
 * the admin UI is a better fit than the binary approve/reject pattern
 * the CreatorProfile queue uses.
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
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
  const parsed = UpdateSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await db.foundingApplication.findUnique({ where: { id: params.id } });
  if (!existing) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const updated = await db.foundingApplication.update({
    where: { id: params.id },
    data: {
      status: parsed.data.status,
      adminNotes: parsed.data.adminNotes,
      reviewedBy: user.id,
      reviewedAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      actorId: user.id,
      action: "founding_application.status_change",
      targetType: "founding_application",
      targetId: updated.id,
      metadata: { from: existing.status, to: updated.status },
    },
  });

  // The one status transition this route reacts to directly: moving
  // INTO APPROVED (not already there) is what unlocks banking +
  // agreements, so that's the point the applicant needs the onboarding
  // link — see src/lib/notifications/onboarding-approved.ts. Never lets
  // a send failure fail the admin's approve action itself, same
  // reasoning as every other notification send in this flow.
  if (existing.status !== "APPROVED" && updated.status === "APPROVED") {
    try {
      await sendOnboardingApprovedEmail(updated.id, updated.email, updated.stageName);
    } catch (err) {
      console.error("[founding-applications] onboarding-approved email failed", err);
    }
  }

  return NextResponse.json({ id: updated.id, status: updated.status });
}
