import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";

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
  whyJoinBaddies: z.string().min(10, "Tell us a little more — a sentence or two is fine.").max(4000),
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

  const application = await db.foundingApplication.create({
    data: { ...data, platforms },
  });

  return NextResponse.json({ applicationId: application.id }, { status: 201 });
}
