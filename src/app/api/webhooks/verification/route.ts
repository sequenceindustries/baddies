import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { applyVerificationOutcome } from "@/lib/creator/verification-workflow";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Verification provider webhook. Same "provider is authoritative" contract
 * as the payment webhook — a verification session's PASSED/FAILED outcome
 * is only ever applied here, never inferred from a client-side redirect.
 *
 * Payload shape below matches the stub provider (src/lib/providers/
 * verification/stub.ts) for local dev; a real vendor's payload will need
 * its own signature verification and field mapping added when wired in
 * (see docs/architecture.md).
 */
const WebhookPayloadSchema = z.object({
  providerSessionId: z.string(),
  status: z.enum(["NOT_STARTED", "PENDING", "IN_PROGRESS", "PASSED", "FAILED", "EXPIRED", "MANUAL_REVIEW"]),
  providerReference: z.string().optional(),
  failureReason: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-verification-signature") ?? "";

  if (!isValidSignature(rawBody, signature)) {
    console.error("[webhook:verification] signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const json = JSON.parse(rawBody);
  const parsed = WebhookPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  await applyVerificationOutcome(parsed.data);

  return NextResponse.json({ received: true });
}

/**
 * Sprint 0/1 placeholder — the stub verification provider has no real
 * signing key. A real vendor implementation must verify an HMAC (or
 * equivalent) here using VERIFICATION_PROVIDER_WEBHOOK_SECRET and reject
 * on mismatch, exactly like the payment webhook does via
 * provider.verifyAndParseWebhook.
 */
function isValidSignature(rawBody: string, signatureHeader: string): boolean {
  const secret = process.env.VERIFICATION_PROVIDER_WEBHOOK_SECRET;
  if (!secret) {
    // Only acceptable while VERIFICATION_PROVIDER=stub in non-production envs.
    if (process.env.VERIFICATION_PROVIDER === "stub" && process.env.NODE_ENV !== "production") {
      return true;
    }
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
