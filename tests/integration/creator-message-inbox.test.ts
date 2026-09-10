import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { threadKeyFor } from "@/lib/messages/thread-key";

/**
 * Integration test for the query logic behind GET /api/creator/
 * messages and GET/POST /api/creator/messages/[threadKey] — thread
 * grouping (latest message per threadKey), the participant-check
 * guard, and reply's recipient derivation. Exercises the real
 * schema/queries directly (no established pattern in this codebase
 * for invoking a route handler's auth/session layer from a test — see
 * tests/integration/carousel-upload.test.ts's own comment on this).
 *
 * Requires a real Postgres connection — skipped automatically if none
 * is reachable, same pattern as every other integration test here.
 */
let dbAvailable = true;

beforeAll(async () => {
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) await db.$disconnect();
});

describe.skipIf(!dbAvailable)("creator message inbox (integration)", () => {
  it("thread grouping picks the latest message per threadKey", async () => {
    const fan = await db.user.create({
      data: { email: `inbox-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creator = await db.user.create({
      data: { email: `inbox-creator-${Date.now()}@example.test`, passwordHash: "test-hash", role: "CREATOR" },
    });
    const threadKey = threadKeyFor(fan.id, creator.id);

    await db.message.create({ data: { senderId: fan.id, recipientId: creator.id, threadKey, body: "first" } });
    await new Promise((r) => setTimeout(r, 5));
    await db.message.create({ data: { senderId: creator.id, recipientId: fan.id, threadKey, body: "second (latest)" } });

    // Same grouping shape GET /api/creator/messages uses: findMany
    // ordered desc, first row seen per threadKey wins.
    const rows = await db.message.findMany({
      where: { OR: [{ senderId: creator.id }, { recipientId: creator.id }] },
      orderBy: { createdAt: "desc" },
    });
    const latestByThread = new Map<string, (typeof rows)[number]>();
    for (const row of rows) {
      if (!latestByThread.has(row.threadKey)) latestByThread.set(row.threadKey, row);
    }
    expect(latestByThread.get(threadKey)?.body).toBe("second (latest)");

    await db.message.deleteMany({ where: { threadKey } });
    await db.user.delete({ where: { id: creator.id } });
    await db.user.delete({ where: { id: fan.id } });
  });

  it("the participant check accepts a real participant and rejects an outsider", async () => {
    const fan = await db.user.create({
      data: { email: `inbox-part-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creator = await db.user.create({
      data: { email: `inbox-part-creator-${Date.now()}@example.test`, passwordHash: "test-hash", role: "CREATOR" },
    });
    const outsider = await db.user.create({
      data: { email: `inbox-part-outsider-${Date.now()}@example.test`, passwordHash: "test-hash", role: "CREATOR" },
    });
    const threadKey = threadKeyFor(fan.id, creator.id);
    await db.message.create({ data: { senderId: fan.id, recipientId: creator.id, threadKey, body: "hi" } });

    const rows = await db.message.findMany({ where: { threadKey } });
    const isParticipant = (userId: string) => rows.some((m) => m.senderId === userId || m.recipientId === userId);

    expect(isParticipant(fan.id)).toBe(true);
    expect(isParticipant(creator.id)).toBe(true);
    expect(isParticipant(outsider.id)).toBe(false);

    await db.message.deleteMany({ where: { threadKey } });
    await db.user.delete({ where: { id: outsider.id } });
    await db.user.delete({ where: { id: creator.id } });
    await db.user.delete({ where: { id: fan.id } });
  });

  it("a reply correctly derives the other party as recipient", async () => {
    const fan = await db.user.create({
      data: { email: `inbox-reply-fan-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });
    const creator = await db.user.create({
      data: { email: `inbox-reply-creator-${Date.now()}@example.test`, passwordHash: "test-hash", role: "CREATOR" },
    });
    const threadKey = threadKeyFor(fan.id, creator.id);
    await db.message.create({ data: { senderId: fan.id, recipientId: creator.id, threadKey, body: "hi" } });

    // Same lookup POST /api/creator/messages/[threadKey] uses to
    // derive recipientId for a reply from the creator's side.
    const existing = await db.message.findFirst({
      where: { threadKey, OR: [{ senderId: creator.id }, { recipientId: creator.id }] },
      select: { senderId: true, recipientId: true },
    });
    expect(existing).not.toBeNull();
    const recipientId = existing!.senderId === creator.id ? existing!.recipientId : existing!.senderId;
    expect(recipientId).toBe(fan.id);

    const reply = await db.message.create({ data: { senderId: creator.id, recipientId, threadKey, body: "reply" } });
    expect(reply.recipientId).toBe(fan.id);
    expect(reply.senderId).toBe(creator.id);

    await db.message.deleteMany({ where: { threadKey } });
    await db.user.delete({ where: { id: creator.id } });
    await db.user.delete({ where: { id: fan.id } });
  });
});
