import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import { encryptField } from "@/lib/security/field-encryption";
import type { Prisma } from "@prisma/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const ApplySchema = z.object({
    displayName: z.string().min(2).max(50),
    legalName: z.string().min(2).max(200),
    bio: z.string().max(2000).optional(),
    // Both optional here — a creator can also set/change these later
    // from /settings (avatarUrl) or the Dashboard's Content tab
    // (featuredImageUrl, CreatorProfile.coverImageUrl).
    avatarUrl: z.string().url().optional(),
    featuredImageUrl: z.string().url().optional(),
    confirmsAdult: z.literal(true, {
          errorMap: () => ({ message: "You must confirm you are 18 or older to apply as a creator." }),
    }),
    agreesToCreatorAgreement: z.literal(true, {
          errorMap: () => ({ message: "You must accept the Creator Agreement to apply." }),
    }),
});

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
    const { displayName, legalName, bio, avatarUrl, featuredImageUrl } = parsed.data;

  const legalNameEncrypted = encryptField(legalName);

  const creatorProfile = await db.$transaction(async (tx: Prisma.TransactionClient) => {
        const created = await tx.creatorProfile.create({
                data: {
                          userId: user.id,
                          status: "VERIFICATION_REQUIRED",
                          legalNameEncrypted,
                          appliedAt: new Date(),
                          coverImageUrl: featuredImageUrl,
                },
        });

                                                   await tx.profile.update({
                                                           where: { userId: user.id },
                                                           data: { displayName, bio, avatarUrl },
                                                   });

                                                   // RBAC's content:create/content:publish permissions are gated on
                                                   // User.role, not CreatorProfile.status — promote to CREATOR here
                                                   // (not only on final admin approval) so a newly-applying creator
                                                   // can draft content while awaiting verification, per the upload
                                                   // route's own design (see its comment on this).
                                                   await tx.user.update({
                                                           where: { id: user.id },
                                                           data: { role: "CREATOR" },
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
