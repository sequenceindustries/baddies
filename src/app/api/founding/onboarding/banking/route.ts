import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { verifyOnboardingToken } from "@/lib/founding/onboarding-token";
import { encryptField } from "@/lib/security/field-encryption";
import { advanceFoundingStatus } from "@/lib/founding/pipeline";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

const BodySchema = z.object({
  token: z.string().min(1),
  bankName: z.string().min(2).max(200),
  accountHolderName: z.string().min(2).max(200),
  accountNumber: z.string().min(4).max(50),
  accountType: z.enum(["SAVINGS", "CHEQUE", "TRANSMISSION", "OTHER"]),
  branchCode: z.string().min(3).max(20),
});

/**
 * Public, unauthenticated, but — unlike the Phase 2 identity/document
 * endpoint (trusted by the bare, unguessable application id alone) —
 * this one requires the onboarding token itself. Banking is more
 * sensitive than an ID photo, and this is a real, cheap upgrade in
 * guarantee: a leaked or logged application id alone can't be used to
 * submit banking details, only a link that was actually emailed to the
 * applicant can (see src/lib/founding/onboarding-token.ts).
 *
 * Requires all 4 current-version agreements accepted in the same
 * request — no partial-acceptance state to reason about later.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const applicationId = await verifyOnboardingToken(parsed.data.token);
  if (!applicationId) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  const application = await db.foundingApplication.findUnique({ where: { id: applicationId } });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  // Can't submit banking before being approved, and a rejected
  // application can't submit it at all — mirrors the identity route's
  // own REJECTED guard, plus the APPROVED-or-later floor this phase
  // adds (see FOUNDING_STATUSES for the linear order).
  const APPROVED_OR_LATER = new Set(["APPROVED", "ONBOARDING", "CONTENT_READY", "LIVE"]);
  if (!APPROVED_OR_LATER.has(application.status)) {
    return NextResponse.json(
      { error: "Banking details can only be submitted after your application is approved." },
      { status: 403 }
    );
  }

  const agreements = await db.agreement.findMany({
    // Latest version per type — "latest" here means most recently made
    // effective, not an assumption about version-string ordering (e.g.
    // "v10" sorting before "v2" alphabetically).
    orderBy: { effectiveAt: "desc" },
  });
  const latestByType = new Map<string, (typeof agreements)[number]>();
  for (const a of agreements) if (!latestByType.has(a.type)) latestByType.set(a.type, a);
  const requiredTypes = ["CREATOR_TERMS", "CONTENT_POLICY", "PRIVACY_POLICY", "PAYOUT_AGREEMENT"];
  const missing = requiredTypes.filter((t) => !latestByType.has(t));
  if (missing.length > 0) {
    // Should never happen outside a broken seed — fails loudly rather
    // than silently letting someone onboard without real agreement rows
    // to point at.
    return NextResponse.json({ error: "Onboarding isn't available right now. Please try again shortly." }, { status: 500 });
  }

  const { bankName, accountHolderName, accountNumber, accountType, branchCode } = parsed.data;
  const accountNumberEncrypted = encryptField(accountNumber);
  const ipAddress = req.headers.get("x-forwarded-for") ?? undefined;

  const result = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.banking.upsert({
      where: { foundingApplicationId: application.id },
      create: {
        foundingApplicationId: application.id,
        bankName,
        accountHolderName,
        accountNumberEncrypted,
        accountType,
        branchCode,
        status: "SUBMITTED",
      },
      update: {
        bankName,
        accountHolderName,
        accountNumberEncrypted,
        accountType,
        branchCode,
        status: "SUBMITTED",
      },
    });

    for (const type of requiredTypes) {
      const agreement = latestByType.get(type)!;
      await tx.agreementAcceptance.create({
        data: {
          agreementId: agreement.id,
          foundingApplicationId: application.id,
          ipAddress,
        },
      });
    }

    const newStatus = advanceFoundingStatus(application.status, "ONBOARDING");
    const updated = await tx.foundingApplication.update({
      where: { id: application.id },
      data: { status: newStatus },
    });

    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "founding_application.onboarding_submitted",
        targetType: "founding_application",
        targetId: application.id,
        metadata: { agreementsAccepted: requiredTypes },
        ipAddress,
      },
    });

    return updated;
  });

  return NextResponse.json({ status: result.status });
}
