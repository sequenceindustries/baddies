import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { verifyOnboardingToken } from "@/lib/founding/onboarding-token";

// Always dynamic: reads live data.
export const dynamic = "force-dynamic";

/**
 * Token-gated (unlike Phase 2's id-only /api/founding/apply/[id]/status
 * — same stronger-guarantee reasoning as the banking POST route in this
 * same directory). Lets /founding-baddies/complete-onboarding show
 * "already submitted" on a repeat visit instead of re-showing the form.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const applicationId = await verifyOnboardingToken(token);
  if (!applicationId) {
    return NextResponse.json({ error: "This link is invalid or has expired." }, { status: 400 });
  }

  const application = await db.foundingApplication.findUnique({
    where: { id: applicationId },
    select: { stageName: true, status: true, banking: { select: { status: true } } },
  });
  if (!application) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  // The real agreement text, not a paraphrase — what an applicant
  // accepts on this page must be the actual document a version-pinned
  // AgreementAcceptance row will point at, not summary copy that could
  // drift from it. "Current" per type = most recently effective row,
  // same rule the banking route uses when recording acceptance.
  const agreementRows = await db.agreement.findMany({ orderBy: { effectiveAt: "desc" } });
  const latestByType = new Map<string, (typeof agreementRows)[number]>();
  for (const a of agreementRows) if (!latestByType.has(a.type)) latestByType.set(a.type, a);

  return NextResponse.json({
    stageName: application.stageName,
    status: application.status,
    bankingSubmitted: application.banking !== null,
    agreements: Array.from(latestByType.values()).map((a) => ({
      type: a.type,
      version: a.version,
      title: a.title,
      bodyText: a.bodyText,
    })),
  });
}
