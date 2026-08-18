import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const ApplySchema = z.object({
  displayName: z.string().min(2).max(50),
  legalName: z.string().min(2).max(200),
  bio: z.string().max(2000).optional(),
  // Explicit re-attestation at the point of applying to monetise — separate
  // from the account-level age gate at registration (§5: "Implement...
  // Creator age verification" as its own step distinct from fan signup).
  confirmsAdult: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you are 18 or older to apply as a creator." }),
  }),
  agreesToCreatorAgreement: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Creator Agreement to apply." }),
  }),
});

/**
 * Any authenticated FAN may apply to become a creator (§4: "CREATOR can:
 * Apply"). This creates a CreatorProfile in PENDING status and immediately
 * advances it to VERIFICATION_REQUIRED — the actual identity/age/liveness
 * verification sessions are created via /api/creator/verification/start,
 * not here, so this route stays a simple intake step.
 *
 * Legal name is encrypted before storage and never echoed back in the
 * response — public identity (display name) is what the rest of the app
 * reads, per build brief §26.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "creator:apply");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const existing = await db.creatorProfile.findUnique({ where: { userId: user.id } });
  if (existing) {
    return NextResponse.json(
      { error: `You already have a creator application (status: ${existing.status}).` },
      { status: 409 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = ApplySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { displayName, legalName, bio } = parsed.data;

  const legalNameEncrypted = encryptAtRest(legalName);

  const creatorProfile = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.creatorProfile.create({
      data: {
        userId: user.id,
        status: "VERIFICATION_REQUIRED",
        legalNameEncrypted,
        appliedAt: new Date(),
      },
    });

    // Upsert the public profile fields the applicant provided; the
    // Profile row itself was created at registration.
    await tx.profile.update({
      where: { userId: user.id },
      data: { displayName, bio },
    });

    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "creator.apply",
        targetType: "creator_profile",
        targetId: created.id,
      },
    });

    return created;
  });

  return NextResponse.json(
    { creatorProfileId: creatorProfile.id, status: creatorProfile.status },
    { status: 201 }
  );
}

/**
 * Placeholder encryption for Sprint 0/1. This must be replaced with a real
 * envelope-encryption call (KMS-backed) before any real legal name is ever
 * written — see build brief §26 ("Do not expose: Government ID, Legal name
 * unless required"). Flagged loudly so it can't ship to production
 * unnoticed.
 */
function encryptAtRest(plaintext: string): string {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "encryptAtRest() is a Sprint 0 placeholder and must not run in production. Wire up real KMS-backed encryption before enabling creator applications in prod."
    );
  }
  return `dev-unencrypted:${plaintext}`;
}
