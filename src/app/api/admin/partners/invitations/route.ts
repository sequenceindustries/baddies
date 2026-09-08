import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { buildPartnerInviteUrl, sendPartnerInviteEmail } from "@/lib/notifications/partner-invite";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const CreateInvitationSchema = z.object({
  email: z.string().email(),
  expiresInDays: z.number().int().positive().max(90).optional(),
});

/** Lists every invitation (any status), newest first — a small admin table, not paginated (the Founding Partner programme has no partner-count limit). */
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
 * Creates a new Founding Partner invitation. No cap on how many partners
 * the programme can have — per explicit product decision, the earlier
 * 10-partner limit is removed outright, not just raised.
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
  const inviteUrl = await buildPartnerInviteUrl(invitation.id, ttlSeconds);
  let emailSent = true;
  try {
    await sendPartnerInviteEmail(inviteUrl, email, expiresAt);
  } catch (err) {
    console.error("[partner-invitations] invite email send failed", err);
    emailSent = false;
  }

  // inviteUrl always comes back, whether or not the email actually
  // landed — a real, working invite link with no other channel once
  // it's gone shouldn't be solely dependent on delivery succeeding (a
  // sandboxed provider, a typo, a spam filter). The admin UI surfaces it
  // directly so it can be copied and sent through anything.
  return NextResponse.json(
    { invitationId: invitation.id, status: invitation.status, inviteUrl, emailSent },
    { status: 201 }
  );
}
