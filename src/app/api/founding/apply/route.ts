import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import type { Prisma } from "@prisma/client";
import {
  getRequestCountry,
  getRequestLocation,
  isSouthAfrica,
  NOT_SOUTH_AFRICA_MESSAGE,
} from "@/lib/security/geo";
import { notifyFoundingApplicationReceived } from "@/lib/notifications/founding-application";
import { sendFoundingEmailVerification } from "@/lib/notifications/email-verification";
import { getWhatsappProvider } from "@/lib/providers/whatsapp";
import { resolveReferralAttribution } from "@/lib/founding/referral-attribution";
import { checkRateLimitByIp, rateLimitResponse } from "@/lib/security/rate-limit";

// Always dynamic: this route writes live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const PlatformEntrySchema = z.object({
  category: z.enum(["social", "creator"]),
  platform: z.string().min(1).max(60),
  handle: z.string().max(100).optional().default(""),
  link: z.string().max(300).optional().default(""),
  followers: z.string().max(50).optional().default(""),
});

const ApplySchema = z.object({
  fullName: z.string().min(2).max(150),
  stageName: z.string().min(2).max(50),
  email: z.string().email(),
  phone: z.string().min(5).max(30),
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(100),
  platforms: z.array(PlatformEntrySchema).min(1, "Select at least one platform you use."),
  audienceSize: z.string().max(200).optional(),
  monetisationExperience: z.string().max(2000).optional(),
  creatingSince: z.string().max(200).optional(),
  currentlyMonetising: z.boolean().optional(),
  confirmsAdult: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you are 18 or older to apply." }),
  }),
  agreesToVerification: z.literal(true, {
    errorMap: () => ({ message: "You must agree to identity verification to apply." }),
  }),
  // Honeypot — real visitors never see or fill this field (see the form's
  // own comment on it). Any non-empty value here is treated as a bot
  // submission and silently accepted without writing a row, rather than
  // telling the bot its request was rejected.
  website: z.string().max(200).optional(),
});

/**
 * Public, unauthenticated by design — this is the top-of-funnel Founding
 * Baddies recruitment form (see /founding-baddies): a prospective
 * creator has no Baddies account yet, that's the whole point of it.
 * Never collects identity documents; real verification only ever
 * happens later through VerificationSession once someone is an actual
 * registered creator (see FoundingApplication's own schema comment).
 */
export async function POST(req: NextRequest) {
  // 5 submissions per 15 minutes per IP — generous for a real applicant
  // (who applies once), tight enough to blunt scripted spam against a
  // public, unauthenticated form.
  const rateLimit = checkRateLimitByIp(req, "founding-apply", 5, 15 * 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const json = await req.json().catch(() => null);
  const parsed = ApplySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { website, platforms, ...data } = parsed.data;
  if (website) {
    // Honeypot tripped — respond as if it worked so a bot doesn't learn
    // to look elsewhere, but write nothing.
    return NextResponse.json({ applicationId: "ok" }, { status: 201 });
  }

  // South African creators only, no exceptions — checked against the
  // request's actual network origin, not the free-text "Country" field
  // above (which is stored for the application record, but proves
  // nothing on its own — see getRequestLocation's comment).
  const { country: detectedCountry, signal: detectionSignal } = await getRequestLocation(req);

  // whyJoinBaddies is a required, non-null column (see the Prisma
  // schema) from when this was still a form question. It no longer
  // is — see the form's own removal of that field — so this writes an
  // empty string rather than needing a migration to make the column
  // nullable for a field nothing populates anymore.
  const applicationData = { ...data, whyJoinBaddies: "", platforms };

  if (!isSouthAfrica(detectedCountry)) {
    // MASTER REQUIREMENTS §1/§19.2: a non-South-African detected location
    // is an immediate rejection, not a manual-review flag — and it must
    // leave an auditable trace (detected country/signal/timestamp/reason),
    // not just a 403 with nothing persisted (the previous behavior here).
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.foundingApplication.create({
        data: { ...applicationData, status: "REJECTED" },
      });
      await tx.location.create({
        data: {
          foundingApplicationId: created.id,
          detectedCountry,
          detectionSignal,
          status: "REJECTED",
          rejectionReason: NOT_SOUTH_AFRICA_MESSAGE,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: null,
          action: "founding_application.reject_geo",
          targetType: "founding_application",
          targetId: created.id,
          metadata: { detectedCountry, detectionSignal },
        },
      });
    });
    return NextResponse.json({ error: NOT_SOUTH_AFRICA_MESSAGE }, { status: 403 });
  }

  // Resolved before the transaction (a read, not part of the atomic
  // write) but the ReferralAttribution row itself is created inside the
  // same transaction as the FoundingApplication below — attribution must
  // exist the instant the application does, never as a separate
  // best-effort step afterward. A missing/invalid/tampered cookie, a
  // suspended partner, or a self-referral (the partner applying through
  // their own link) all resolve to "no attribution" silently — none of
  // these should block the application itself.
  const referralPartnerId = await resolveReferralAttribution(req, applicationData.email);

  const application = await db.$transaction(async (tx) => {
    const created = await tx.foundingApplication.create({ data: applicationData });
    await tx.location.create({
      data: {
        foundingApplicationId: created.id,
        detectedCountry,
        detectionSignal,
        status: "SOUTH_AFRICA",
      },
    });
    // Initializes the verification-state row (both timestamps null) so
    // it exists from the start of the pipeline rather than being
    // lazily created whenever Phase 2's WhatsApp/email flows first touch
    // it.
    await tx.contact.create({ data: { foundingApplicationId: created.id } });
    if (referralPartnerId) {
      await tx.referralAttribution.create({
        data: { foundingApplicationId: created.id, foundingPartnerId: referralPartnerId },
      });
    }
    return created;
  });

  // Never lets a notification failure fail or block the applicant's
  // submission — the row above is already committed regardless. Same
  // reasoning applies to the applicant's own verification email below:
  // a delivery failure there is real (they can't verify), but it must
  // never turn into a failed submission — they've already applied.
  try {
    await notifyFoundingApplicationReceived(application);
  } catch (err) {
    console.error("[founding-apply] admin notification failed", err);
  }
  try {
    await sendFoundingEmailVerification(application.id, application.email, application.stageName);
  } catch (err) {
    console.error("[founding-apply] email verification send failed", err);
  }

  // The applicant's very next step (identity + documents, or a WhatsApp
  // message) needs somewhere to go right now, in the same page load —
  // see the plan's "resumability" note for why the emailed link is the
  // *other* way back into this, not the only one.
  const whatsappLink = getWhatsappProvider().buildClickToChatLink(
    `Hi, I'm ${application.stageName} — I just applied to become a Founding Baddie (application ${application.id}).`
  );

  return NextResponse.json({ applicationId: application.id, whatsappLink }, { status: 201 });
}

/**
 * Lets the application page check eligibility up front (see
 * EligibilityBanner) instead of only ever finding out after filling in
 * the whole form — the real, unbypassable enforcement is still the POST
 * handler above; this is purely so a non-South-African visitor sees the
 * "no exceptions" message immediately rather than at the very end.
 */
export async function GET(req: NextRequest) {
  const country = await getRequestCountry(req);
  return NextResponse.json({ eligible: isSouthAfrica(country), country });
}
