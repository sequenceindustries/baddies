import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { sendPartnerInviteEmail } from "@/lib/notifications/partner-invite";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const MAX_PARTNERS = 10;

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  expiresInDays: z.number().int().positive().max(90).optional(),
});

/** Lists every invitation (any status), newest first — a small admin table, not paginated (the whole programme is capped at 10 partners). */
export async function GET() {
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

  const invitations = await db.partnerInvitation.findMany({
    orderBy: { createdAt: "desc" },
    include: { invitedByUser: { select: { email: true } }, foundingPartner: { select: { id: true, status: true } } },
  });

  return NextResponse.json({
    invitations: invitations.map((inv: (typeof invitations)[number]) => ({
      id: inv.id,
      email: inv.email,
      status: inv.status,
      invitedByEmail: inv.invitedByUser.email,
      expiresAt: inv.expiresAt,
      acceptedAt: inv.acceptedAt,
      revokedAt: inv.revokedAt,
      resentAt: inv.resentAt,
      resendCount: inv.resendCount,
      createdAt: inv.createdAt,
      foundingPartnerId: inv.foundingPartner?.id ?? null,
    })),
  });
}

/**
 * Creates a new Founding Partner invitation. Enforces the 10-partner cap
 * at creation time — counted as ACTIVE FoundingPartners plus still-PENDING
 * invitations, so admin can never promise more than 10 slots even if a
 * few invites are outstanding.
 */
export async function POST(req: NextRequest) {
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
  const parsed = CreateInvitationSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { email, expiresInDays } = parsed.data;

  const [activePartnerCount, pendingInviteCount] = await Promise.all([
    db.foundingPartner.count({ where: { status: "ACTIVE" } }),
    db.partnerInvitation.count({ where: { status: "PENDING" } }),
  ]);
  if (activePartnerCount + pendingInviteCount >= MAX_PARTNERS) {
    return NextResponse.json(
      { error: `The Founding Partner programme is limited to ${MAX_PARTNERS} partners — no room for a new invitation right now.` },
      { status: 409 }
    );
  }

  const existingPending = await db.partnerInvitation.findFirst({ where: { email, status: "PENDING" } });
  if (existingPending) {
    return NextResponse.json({ error: "This email already has a pending invitation." }, { status: 409 });
  }
  const existingPartnerUser = await db.user.findUnique({ where: { email } });
  if (existingPartnerUser) {
    return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
  }

  const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

  const invitation = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const created = await tx.partnerInvitation.create({
      data: { email, invitedBy: user.id, expiresAt },
    });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "founding_partner.invited",
        targetType: "partner_invitation",
        targetId: created.id,
        metadata: { email, expiresAt },
        ipAddress: req.headers.get("x-forwarded-for") ?? undefined,
      },
    });
    return created;
  });

  const ttlSeconds = expiresAt ? Math.max(Math.floor((expiresAt.getTime() - Date.now()) / 1000), 1) : undefined;
  try {
    await sendPartnerInviteEmail(invitation.id, email, expiresAt, ttlSeconds);
  } catch (err) {
    console.error("[partner-invitations] invite email send failed", err);
  }

  return NextResponse.json({ invitationId: invitation.id, status: invitation.status }, { status: 201 });
}
