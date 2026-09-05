import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { CreatorStatus } from "@prisma/client";
import { getMediaStorageProvider } from "@/lib/providers/storage";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const QUEUE_STATUSES: CreatorStatus[] = ["VERIFICATION_REQUIRED", "UNDER_REVIEW"];

/**
 * Lists creator applications for the admin compliance-review queue (§23:
 * "Creator Management: Applications, Verification, Approvals..."). Only
 * exposes what an admin needs to make a decision — never raw verification
 * documents (those stay behind the provider's hosted reference, per §7:
 * "Do not expose sensitive verification documents to normal users").
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
    },
  });

  // A MANUAL_REVIEW session's providerReference is a self-capture storage
  // key (see POST /api/creator/verification/capture) — sign it once per
  // application so an admin can actually see the evidence they're
  // approving/rejecting. Never exposed to anyone but admins with
  // creator:verify (enforced above).
  const storage = getMediaStorageProvider();
  const applicationsWithCaptureUrl = await Promise.all(
    applications.map(async (app: (typeof applications)[number]) => {
      const pending = app.verifications.find(
        (v: (typeof app.verifications)[number]) => v.status === "MANUAL_REVIEW" && v.providerReference
      );
      const captureReviewUrl = pending ? await storage.getSignedReadUrl(pending.providerReference!) : null;
      return {
        creatorProfileId: app.id,
        status: app.status,
        appliedAt: app.appliedAt,
        applicantEmail: app.user.email,
        captureReviewUrl,
        verificationChecks: app.verifications.map((v: (typeof app.verifications)[number]) => ({
          type: v.type,
          status: v.status,
          completedAt: v.completedAt,
        })),
      };
    })
  );

  return NextResponse.json({ applications: applicationsWithCaptureUrl });
}
