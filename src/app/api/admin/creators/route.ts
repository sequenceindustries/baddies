import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { CreatorStatus } from "@prisma/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";
import { decryptField } from "@/lib/security/field-encryption";
import { maskAccountNumber } from "@/lib/security/mask";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const QUEUE_STATUSES: CreatorStatus[] = ["VERIFICATION_REQUIRED", "UNDER_REVIEW"];

/**
 * Lists creator applications for the admin compliance-review queue (§23:
 * "Creator Management: Applications, Verification, Approvals..."). Only
 * exposes what an admin needs to make a decision — ID number is
 * decrypted then masked server-side, never sent to the client in
 * plaintext (per §3, same rule banking details already follow).
 */
export async function GET(req: NextRequest) {
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

  const statusParam = req.nextUrl.searchParams.get("status") as CreatorStatus | null;
  const statuses = statusParam ? [statusParam] : QUEUE_STATUSES;

  const applications = await db.creatorProfile.findMany({
    where: { status: { in: statuses } },
    orderBy: { appliedAt: "asc" },
    take: 50,
    select: {
      id: true,
      status: true,
      appliedAt: true,
      user: { select: { email: true } },
      verifications: {
        select: { type: true, status: true, completedAt: true, providerReference: true },
      },
      identity: { select: { dateOfBirth: true, nationality: true, idNumberEncrypted: true } },
      identityDocument: { select: { storageKey: true } },
    },
  });

  // A MANUAL_REVIEW session's providerReference is a self-capture storage
  // key (see POST /api/creator/verification/capture) — sign it once per
  // application, per group, so an admin can actually see the evidence
  // they're approving/rejecting. Never exposed to anyone but admins with
  // creator:verify (enforced above).
  const storage = getMediaStorageProvider();
  const applicationsWithDetail = await Promise.all(
    applications.map(async (app: (typeof applications)[number]) => {
      const pendingByType = (types: string[]) =>
        app.verifications.find(
          (v: (typeof app.verifications)[number]) => types.includes(v.type) && v.status === "MANUAL_REVIEW" && v.providerReference
        );
      const identityAgePending = pendingByType(["IDENTITY", "AGE"]);
      const livenessPending = pendingByType(["LIVENESS"]);

      const [identityAgeReviewUrl, livenessReviewUrl, identityDocumentUrl] = await Promise.all([
        identityAgePending ? storage.getSignedReadUrl(identityAgePending.providerReference!) : Promise.resolve(null),
        livenessPending ? storage.getSignedReadUrl(livenessPending.providerReference!) : Promise.resolve(null),
        app.identityDocument ? storage.getSignedReadUrl(app.identityDocument.storageKey) : Promise.resolve(null),
      ]);

      return {
        creatorProfileId: app.id,
        status: app.status,
        appliedAt: app.appliedAt,
        applicantEmail: app.user.email,
        identityDetails: app.identity
          ? {
              dateOfBirth: app.identity.dateOfBirth,
              nationality: app.identity.nationality,
              maskedIdNumber: maskAccountNumber(decryptField(app.identity.idNumberEncrypted)),
            }
          : null,
        identityDocumentUrl,
        identityAgeReviewUrl,
        livenessReviewUrl,
        verificationChecks: app.verifications.map((v: (typeof app.verifications)[number]) => ({
          type: v.type,
          status: v.status,
          completedAt: v.completedAt,
        })),
      };
    })
  );

  return NextResponse.json({ applications: applicationsWithDetail });
}
