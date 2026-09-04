import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import { verifyEmailVerificationToken } from "@/lib/founding/email-verification";
import { advanceFoundingStatus } from "@/lib/founding/pipeline";

// Always dynamic: writes live data.
export const dynamic = "force-dynamic";

const BodySchema = z.object({ token: z.string().min(1) });

/**
 * Public, unauthenticated — the token itself (signed, purpose-tagged,
 * see src/lib/founding/email-verification.ts) is the credential; nothing
 * else identifies the caller, same as clicking any other emailed
 * confirmation link. Idempotent: verifying an already-verified email is
 * a no-op success, not an error, since a person may click the link twice.
 */
export async function POST(req: NextRequest) {
  const json = await req.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Missing or invalid token." }, { status: 400 });
  }

  const applicationId = await verifyEmailVerificationToken(parsed.data.token);
  if (!applicationId) {
    return NextResponse.json({ error: "This verification link is invalid or has expired." }, { status: 400 });
  }

  const application = await db.foundingApplication.findUnique({
    where: { id: applicationId },
    include: { contact: true },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }
  if (!application.contact) {
    // Every accepted application gets a Contact row at creation time (see
    // POST /api/founding/apply) — this only happens for a rejected
    // application, which shouldn't have a working verification link at
    // all, but is handled explicitly rather than crashing on a null deref.
    return NextResponse.json({ error: "This application can't be verified." }, { status: 403 });
  }

  if (application.contact.emailVerifiedAt) {
    return NextResponse.json({ status: application.status, alreadyVerified: true });
  }

  const bothVerified = application.contact.whatsappVerifiedAt !== null;
  const newStatus = bothVerified
    ? advanceFoundingStatus(application.status, "CONTACT_CONFIRMED")
    : application.status;

  const updated = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // updateMany + a WHERE guard, not update(), makes this atomic against
    // a genuine race (a double-click, two tabs, or — as seen locally in
    // dev — React StrictMode double-invoking the effect that calls this
    // route): only the request that actually flips the row from
    // unverified to verified gets to advance the status and write the
    // audit log; a concurrent loser sees `count: 0` and backs off as a
    // no-op rather than both racing past the read-then-write gap that a
    // plain findUnique-then-update would leave open.
    const result = await tx.contact.updateMany({
      where: { foundingApplicationId: application.id, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
    if (result.count === 0) {
      const current = await tx.foundingApplication.findUniqueOrThrow({ where: { id: application.id } });
      return { app: current, wrote: false };
    }
    const app = await tx.foundingApplication.update({
      where: { id: application.id },
      data: { status: newStatus },
    });
    await tx.auditLog.create({
      data: {
        actorId: null,
        action: "founding_application.email_verified",
        targetType: "founding_application",
        targetId: application.id,
        metadata: {},
      },
    });
    return { app, wrote: true };
  });

  return NextResponse.json({ status: updated.app.status, alreadyVerified: !updated.wrote });
}
