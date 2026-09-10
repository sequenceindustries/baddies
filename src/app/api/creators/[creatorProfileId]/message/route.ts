import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { threadKeyFor } from "@/lib/messages/thread-key";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

const SendMessageSchema = z.object({
  body: z.string().min(1, "Message can't be empty.").max(2000),
});

/**
 * Social-feed redesign, comment/message icon — a minimal REAL send, no
 * inbox (explicit product decision: a full thread-history UI is
 * separate future work). Writes one real Message row with a correctly
 * computed threadKey so a real inbox built later can group these
 * without a backfill — see thread-key.ts's own comment. There is no
 * GET here and nothing anywhere reads Message yet; this route exists
 * purely so the compose modal's "Send" button does something real.
 *
 * Gated (direct request: "fans can only message creators theyre
 * subscribe to, creator has the option to allow or not allow
 * messages") — a fan needs a real, currently-active Exclusive
 * subscription to this creator, checked with the exact same shape
 * canAccessContent uses (src/lib/entitlements/content.ts), and the
 * creator must not have opted out via CreatorProfile.acceptsMessages.
 */
export async function POST(req: NextRequest, { params }: { params: { creatorProfileId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const creator = await db.creatorProfile.findUnique({ where: { id: params.creatorProfileId } });
  if (!creator || creator.status !== "VERIFIED") {
    return NextResponse.json({ error: "Creator not found." }, { status: 404 });
  }

  if (creator.userId === user.id) {
    return NextResponse.json({ error: "You cannot message your own creator profile." }, { status: 400 });
  }

  if (!creator.acceptsMessages) {
    return NextResponse.json({ error: "This creator isn't accepting messages right now." }, { status: 403 });
  }

  const activeSub = await db.subscription.findFirst({
    where: {
      fanId: user.id,
      creatorProfileId: creator.id,
      status: "ACTIVE",
      currentPeriodEnd: { gte: new Date() },
    },
    select: { id: true },
  });
  if (!activeSub) {
    return NextResponse.json({ error: "Subscribe to this creator to send a message." }, { status: 403 });
  }

  const message = await db.message.create({
    data: {
      senderId: user.id,
      recipientId: creator.userId,
      threadKey: threadKeyFor(user.id, creator.userId),
      body: parsed.data.body,
    },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ id: message.id, createdAt: message.createdAt }, { status: 201 });
}
