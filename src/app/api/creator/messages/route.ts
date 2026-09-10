import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db/client";
import { resolveDisplayUrl } from "@/lib/media/persist-public-image";

// Always dynamic: this route reads/writes live data (DB, auth, or both)
// and must never be statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Minimal message inbox — the real follow-up to POST /api/creators/
 * [creatorProfileId]/message's own "a minimal REAL send, no inbox"
 * scope note. `Message.recipientId` has no back-relation on `User`
 * (only `senderId` does, via `sentMessages`), and there's no `readAt`
 * field, so this is a plain findMany + in-memory grouping by
 * `threadKey` — same idiom every other list route in this codebase
 * already uses when there's no relation to lean on.
 *
 * Lists every thread the current user is a participant in (either
 * side), newest message first, with the "other party" resolved via
 * one batched Profile lookup — same shape GET /api/creator/
 * notifications already established for actor resolution.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rows = await db.message.findMany({
    where: { OR: [{ senderId: user.id }, { recipientId: user.id }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, threadKey: true, senderId: true, recipientId: true, body: true, createdAt: true },
  });

  // Already sorted newest-first, so the first row seen per threadKey is
  // that thread's latest message.
  const latestByThread = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latestByThread.has(row.threadKey)) latestByThread.set(row.threadKey, row);
  }

  const otherPartyIds = Array.from(
    new Set(
      Array.from(latestByThread.values()).map((m) => (m.senderId === user.id ? m.recipientId : m.senderId))
    )
  );

  const profiles = otherPartyIds.length
    ? await db.profile.findMany({
        where: { userId: { in: otherPartyIds } },
        select: { userId: true, displayName: true, avatarUrl: true },
      })
    : [];

  const resolvedByUserId = new Map(
    await Promise.all(
      profiles.map(async (p) => [p.userId, { displayName: p.displayName, avatarUrl: (await resolveDisplayUrl(p.avatarUrl)) ?? null }] as const)
    )
  );

  const threads = Array.from(latestByThread.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map((m) => {
      const otherPartyId = m.senderId === user.id ? m.recipientId : m.senderId;
      return {
        threadKey: m.threadKey,
        otherParty: resolvedByUserId.get(otherPartyId) ?? null,
        lastMessage: { body: m.body, createdAt: m.createdAt, fromMe: m.senderId === user.id },
      };
    });

  return NextResponse.json({ threads });
}
