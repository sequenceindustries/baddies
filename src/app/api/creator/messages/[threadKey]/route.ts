import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * One thread's full message history, and (POST) a reply into it.
 * Access is participant-checked, not role-checked — the current user
 * must be the sender or recipient on at least one row with this
 * threadKey, or this 404s (same "don't reveal existence" pattern the
 * rest of this app's auth-gated single-item routes already use)
 * rather than trusting recipientId alone, so a creator can't read
 * another creator's conversation by guessing a threadKey.
 */
export async function GET(_req: NextRequest, { params }: { params: { threadKey: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rows = await db.message.findMany({
    where: { threadKey: params.threadKey },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderId: true, recipientId: true, body: true, createdAt: true },
  });

  const first = rows[0];
  const isParticipant = rows.some((m) => m.senderId === user.id || m.recipientId === user.id);
  if (!first || !isParticipant) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const otherPartyId = first.senderId === user.id ? first.recipientId : first.senderId;
  const profile = await db.profile.findUnique({
    where: { userId: otherPartyId },
    select: { displayName: true, avatarUrl: true },
  });

  return NextResponse.json({
    threadKey: params.threadKey,
    otherParty: profile ? { displayName: profile.displayName, avatarUrl: (await resolveDisplayUrl(profile.avatarUrl)) ?? null } : null,
    messages: rows.map((m) => ({ id: m.id, body: m.body, senderId: m.senderId, createdAt: m.createdAt, fromMe: m.senderId === user.id })),
  });
}

const ReplySchema = z.object({
  body: z.string().min(1, "Message can't be empty.").max(2000),
});

/**
 * Reply into an existing thread. No subscription/acceptsMessages gate
 * here — those protect the *first* message a fan sends (POST /api/
 * creators/:id/message); a thread already existing means that gate
 * already passed once, and this is just continuing an established
 * conversation.
 */
export async function POST(req: NextRequest, { params }: { params: { threadKey: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const existing = await db.message.findFirst({
    where: { threadKey: params.threadKey, OR: [{ senderId: user.id }, { recipientId: user.id }] },
    select: { senderId: true, recipientId: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Thread not found." }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const parsed = ReplySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const recipientId = existing.senderId === user.id ? existing.recipientId : existing.senderId;

  const message = await db.message.create({
    data: { senderId: user.id, recipientId, threadKey: params.threadKey, body: parsed.data.body },
    select: { id: true, createdAt: true },
  });

  return NextResponse.json({ id: message.id, createdAt: message.createdAt }, { status: 201 });
}
