import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getWhatsappProvider } from "@/lib/providers/whatsapp";

// Always dynamic: reads live data.
export const dynamic = "force-dynamic";

/**
 * Public, minimal, no auth — deliberately returns nothing beyond what
 * the applicant already knows or needs to see the right next-step UI.
 * No email/phone/legal-name/etc. echoed back. Scoped by the application's
 * `cuid` id, same unguessable-id trust model the rest of this
 * unauthenticated flow already relies on (see /api/founding/apply/[id]/identity).
 *
 * Used by /founding-baddies/verify-email — the resume path: someone
 * clicking the emailed link days later has no in-memory state from the
 * original submission, so this is how that page knows what's left to do.
 */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const application = await db.foundingApplication.findUnique({
    where: { id: params.id },
    select: {
      stageName: true,
      status: true,
      identity: { select: { status: true } },
      contact: { select: { emailVerifiedAt: true, whatsappVerifiedAt: true } },
    },
  });

  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  // Included here too (not just in the original POST /api/founding/apply
  // response) so the resume path — someone arriving fresh via the emailed
  // verification link, with no in-memory state from the original submit
  // — can show the same WhatsApp step without duplicating link-building
  // logic (or exposing BADDIES_WHATSAPP_NUMBER) client-side.
  const whatsappLink = getWhatsappProvider().buildClickToChatLink(
    `Hi, I'm ${application.stageName} — I just applied to become a Founding Baddie (application ${params.id}).`
  );

  return NextResponse.json({
    stageName: application.stageName,
    status: application.status,
    identitySubmitted: application.identity ? application.identity.status !== "NOT_SUBMITTED" : false,
    emailVerified: application.contact?.emailVerifiedAt !== null && application.contact?.emailVerifiedAt !== undefined,
    whatsappVerified: application.contact?.whatsappVerifiedAt !== null && application.contact?.whatsappVerifiedAt !== undefined,
    whatsappLink,
  });
}
