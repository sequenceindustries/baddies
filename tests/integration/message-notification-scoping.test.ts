import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { SOCIAL_NOTIFICATION_TYPES } from "@/lib/creator-notifications/create-notification";

/**
 * Integration test for the type-scoping between NotificationBell (the
 * three "social" types) and MessageBell ("message.received") —
 * src/components/ui.tsx. A new message must count toward MessageBell's
 * badge only, never NotificationBell's, and vice versa for a like/
 * follow/subscribe — otherwise the same event gets counted twice
 * across two different bells, or a message silently shows up in the
 * wrong one.
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

describe.skipIf(!dbAvailable)("notification/message bell type-scoping (integration)", () => {
  it("a message.received notification is excluded from the social-bell count but included in the message-bell count", async () => {
    const user = await db.user.create({
      data: { email: `bell-scope-${Date.now()}@example.test`, passwordHash: "test-hash", role: "FAN" },
    });

    await db.notification.create({ data: { userId: user.id, type: "creator.followed", payload: {} } });
    await db.notification.create({ data: { userId: user.id, type: "message.received", payload: {} } });

    // Same query shape GET /api/creator/notifications/unread-count uses.
    const socialCount = await db.notification.count({
      where: { userId: user.id, readAt: null, type: { in: [...SOCIAL_NOTIFICATION_TYPES] } },
    });
    expect(socialCount).toBe(1);

    // Same query shape GET /api/messages/unread-count uses.
    const messageCount = await db.notification.count({
      where: { userId: user.id, readAt: null, type: "message.received" },
    });
    expect(messageCount).toBe(1);

    // Marking the social bell read (same shape POST /api/creator/
    // notifications/mark-read uses) must not touch the message one.
    await db.notification.updateMany({
      where: { userId: user.id, readAt: null, type: { in: [...SOCIAL_NOTIFICATION_TYPES] } },
      data: { readAt: new Date() },
    });
    expect(
      await db.notification.count({ where: { userId: user.id, readAt: null, type: "message.received" } })
    ).toBe(1);
    expect(
      await db.notification.count({
        where: { userId: user.id, readAt: null, type: { in: [...SOCIAL_NOTIFICATION_TYPES] } },
      })
    ).toBe(0);

    await db.notification.deleteMany({ where: { userId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  });
});
