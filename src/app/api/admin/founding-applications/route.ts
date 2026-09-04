import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { can, requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { decryptField } from "@/lib/security/field-encryption";
import { maskAccountNumber } from "@/lib/security/mask";
import type { FoundingApplicationStatus } from "@prisma/client";

// Always dynamic: this route reads live data (DB, auth, or both) and
// must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Lists Founding Baddies campaign applications for admin review. Reuses
 * "creator:verify" (ADMIN-only) rather than a new permission — this is
 * the same kind of decision (does this person get to become a creator
 * on Baddies) one step earlier in the funnel.
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

  const statusParam = req.nextUrl.searchParams.get("status") as FoundingApplicationStatus | null;

  // §3: banking data is admin-restricted specifically, not just anyone
  // who can review applications — see the new "banking:view" permission.
  const canViewBanking = can(user.role, "banking:view");

  const applications = await db.foundingApplication.findMany({
    where: statusParam ? { status: statusParam } : undefined,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { identity: true, contact: true, location: true, banking: true },
  });

  return NextResponse.json({
    applications: applications.map((a: (typeof applications)[number]) => ({
      id: a.id,
      fullName: a.fullName,
      stageName: a.stageName,
      email: a.email,
      phone: a.phone,
      country: a.country,
      city: a.city,
      platforms: a.platforms,
      audienceSize: a.audienceSize,
      monetisationExperience: a.monetisationExperience,
      creatingSince: a.creatingSince,
      currentlyMonetising: a.currentlyMonetising,
      whyJoinBaddies: a.whyJoinBaddies,
      status: a.status,
      adminNotes: a.adminNotes,
      createdAt: a.createdAt,
      // Sub-statuses (MASTER REQUIREMENTS §5, §7) — mostly empty/default
      // until Phase 2 builds real capture; surfaced now so the admin
      // queue can start showing them (read-only in Phase 1).
      identity: a.identity ? { status: a.identity.status } : null,
      contact: a.contact
        ? {
            emailVerified: a.contact.emailVerifiedAt !== null,
            whatsappVerified: a.contact.whatsappVerifiedAt !== null,
          }
        : null,
      location: a.location
        ? {
            status: a.location.status,
            detectedCountry: a.location.detectedCountry,
            detectionSignal: a.location.detectionSignal,
            detectionTimestamp: a.location.detectionTimestamp,
            rejectionReason: a.location.rejectionReason,
          }
        : null,
      // Never the decrypted plaintext, and only for admins with
      // banking:view at all — see maskAccountNumber's own comment.
      banking:
        a.banking && canViewBanking
          ? {
              status: a.banking.status,
              bankName: a.banking.bankName,
              accountHolderName: a.banking.accountHolderName,
              maskedAccountNumber: maskAccountNumber(decryptField(a.banking.accountNumberEncrypted)),
              accountType: a.banking.accountType,
              branchCode: a.banking.branchCode,
            }
          : null,
    })),
  });
}
