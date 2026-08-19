import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Every conversation the current user is part of, most recently active
 * first — the inbox list for /messages. One row per distinct threadKey,
 * carrying the other party's display info and the latest message.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const messages = await db.message.findMany({
    where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    orderBy: { createdAt: "desc" },
    select: {
      threadKey: true,
      senderId: true,
      recipientId: true,
      body: true,
      createdAt: true,
    },
  });

  const threads = new Map<
    string,
    { otherUserId: string; lastBody: string | null; lastAt: Date; lastSenderId: string }
  >();
  for (const m of messages) {
    if (threads.has(m.threadKey)) continue; // already-seen thread is necessarily older (desc order)
    const otherUserId = m.senderId === user.id ? m.recipientId : m.senderId;
    threads.set(m.threadKey, { otherUserId, lastBody: m.body, lastAt: m.createdAt, lastSenderId: m.senderId });
  }

  const otherUserIds = Array.from(threads.values()).map((t) => t.otherUserId);
  const profiles = await db.profile.findMany({
    where: { userId: { in: otherUserIds } },
    select: { userId: true, displayName: true, avatarUrl: true },
  });
  const profileByUserId = new Map(profiles.map((p: (typeof profiles)[number]) => [p.userId, p]));

  const result = Array.from(threads.entries())
    .map(([threadKey, t]) => ({
      threadKey,
      otherUserId: t.otherUserId,
      otherDisplayName: profileByUserId.get(t.otherUserId)?.displayName ?? null,
      otherAvatarUrl: profileByUserId.get(t.otherUserId)?.avatarUrl ?? null,
      lastMessage: t.lastBody,
      lastMessageAt: t.lastAt,
      lastMessageFromMe: t.lastSenderId === user.id,
    }))
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

  return NextResponse.json({ threads: result });
}
