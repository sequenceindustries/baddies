import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { canMessage, threadKeyFor } from "@/lib/messaging/access";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/** Full conversation with one specific person. */
export async function GET(req: NextRequest, { params }: { params: { otherUserId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const allowed = await canMessage(user, params.otherUserId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You can only message a creator you actively subscribe to (or, as a creator, your own active subscribers)." },
      { status: 403 }
    );
  }

  const threadKey = threadKeyFor(user.id, params.otherUserId);
  const messages = await db.message.findMany({
    where: { threadKey },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderId: true, body: true, createdAt: true },
  });

  return NextResponse.json({
    messages: messages.map((m: (typeof messages)[number]) => ({
      messageId: m.id,
      senderId: m.senderId,
      fromMe: m.senderId === user.id,
      body: m.body,
      createdAt: m.createdAt,
    })),
  });
}

const SendMessageSchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function POST(req: NextRequest, { params }: { params: { otherUserId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const allowed = await canMessage(user, params.otherUserId);
  if (!allowed) {
    return NextResponse.json(
      { error: "You can only message a creator you actively subscribe to (or, as a creator, your own active subscribers)." },
      { status: 403 }
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = SendMessageSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const message = await db.message.create({
    data: {
      senderId: user.id,
      recipientId: params.otherUserId,
      threadKey: threadKeyFor(user.id, params.otherUserId),
      body: parsed.data.body,
    },
  });

  return NextResponse.json(
    { messageId: message.id, senderId: message.senderId, body: message.body, createdAt: message.createdAt },
    { status: 201 }
  );
}
