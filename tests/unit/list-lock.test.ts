import { describe, it, expect } from "vitest";
import { computeLockState, type ViewerLockContext, type LockableContentItem } from "@/lib/entitlements/list-lock";

/**
 * Pure branch coverage for computeLockState — the display-only mirror
 * of canAccessContent's rules used by the feed/discovery/profile list
 * routes. No DB involved (unlike canAccessContent itself); see
 * tests/integration/list-lock-parity.test.ts for the cross-check
 * against the real, authoritative function.
 */

function ctx(overrides: Partial<ViewerLockContext> = {}): ViewerLockContext {
  return {
    userId: null,
    role: null,
    subscribedCreatorProfileIds: new Set(),
    ownedCreatorProfileIds: new Set(),
    vipPassActive: false,
    trialActive: false,
    ...overrides,
  };
}

function item(overrides: Partial<LockableContentItem> = {}): LockableContentItem {
  return {
    creatorProfileId: "creator-1",
    accessLevel: "FREE",
    status: "APPROVED",
    publishedAt: new Date(),
    creatorUnlimitedOptedIn: false,
    ...overrides,
  };
}

describe("computeLockState", () => {
  it("a live FREE post is never locked, even for a signed-out viewer", () => {
    const result = computeLockState(item({ accessLevel: "FREE" }), ctx());
    expect(result).toEqual({ locked: false, kind: null });
  });

  it("a not-yet-live FREE post is locked for a signed-out viewer", () => {
    const result = computeLockState(item({ accessLevel: "FREE", publishedAt: null }), ctx());
    expect(result.locked).toBe(true);
  });

  it("VIP content is locked for a signed-out viewer", () => {
    const result = computeLockState(item({ accessLevel: "VIP" }), ctx());
    expect(result).toEqual({ locked: true, kind: "VIP_PASS" });
  });

  it("VVIP content is locked for a signed-out viewer", () => {
    const result = computeLockState(item({ accessLevel: "VVIP" }), ctx());
    expect(result).toEqual({ locked: true, kind: "VVIP_SUBSCRIBE" });
  });

  it("ADMIN always sees everything unlocked, regardless of tier", () => {
    for (const accessLevel of ["FREE", "VIP", "VVIP"] as const) {
      const result = computeLockState(item({ accessLevel, publishedAt: null }), ctx({ userId: "admin-1", role: "ADMIN" }));
      expect(result).toEqual({ locked: false, kind: null });
    }
  });

  it("the owning creator always sees their own content unlocked, even unpublished", () => {
    const result = computeLockState(
      item({ accessLevel: "VVIP", publishedAt: null, creatorProfileId: "creator-1" }),
      ctx({ userId: "creator-user-1", role: "CREATOR", ownedCreatorProfileIds: new Set(["creator-1"]) })
    );
    expect(result).toEqual({ locked: false, kind: null });
  });

  it("a non-owning, non-admin signed-in fan still can't see an unpublished item", () => {
    const result = computeLockState(item({ accessLevel: "FREE", publishedAt: null }), ctx({ userId: "fan-1", role: "FAN" }));
    expect(result.locked).toBe(true);
  });

  it("VIP unlocks for a fan with an active VVIP subscription to that specific creator", () => {
    const result = computeLockState(
      item({ accessLevel: "VIP", creatorProfileId: "creator-1" }),
      ctx({ userId: "fan-1", role: "FAN", subscribedCreatorProfileIds: new Set(["creator-1"]) })
    );
    expect(result).toEqual({ locked: false, kind: null });
  });

  it("VVIP unlocks ONLY via a subscription to that specific creator — a VIP pass never unlocks VVIP", () => {
    const result = computeLockState(
      item({ accessLevel: "VVIP", creatorProfileId: "creator-1", creatorUnlimitedOptedIn: true }),
      ctx({ userId: "fan-1", role: "FAN", vipPassActive: true, trialActive: true })
    );
    expect(result).toEqual({ locked: true, kind: "VVIP_SUBSCRIBE" });
  });

  it("VIP unlocks via an active platform VIP pass, but only if this creator opted in", () => {
    const optedIn = computeLockState(
      item({ accessLevel: "VIP", creatorUnlimitedOptedIn: true }),
      ctx({ userId: "fan-1", role: "FAN", vipPassActive: true })
    );
    expect(optedIn).toEqual({ locked: false, kind: null });

    const notOptedIn = computeLockState(
      item({ accessLevel: "VIP", creatorUnlimitedOptedIn: false }),
      ctx({ userId: "fan-1", role: "FAN", vipPassActive: true })
    );
    expect(notOptedIn).toEqual({ locked: true, kind: "VIP_PASS" });
  });

  it("VIP unlocks via an active trial, same opted-in gate as the VIP pass", () => {
    const result = computeLockState(
      item({ accessLevel: "VIP", creatorUnlimitedOptedIn: true }),
      ctx({ userId: "fan-1", role: "FAN", trialActive: true })
    );
    expect(result).toEqual({ locked: false, kind: null });
  });

  it("a signed-in fan with no subscription, pass, or trial sees VIP as locked", () => {
    const result = computeLockState(
      item({ accessLevel: "VIP", creatorUnlimitedOptedIn: true }),
      ctx({ userId: "fan-1", role: "FAN" })
    );
    expect(result).toEqual({ locked: true, kind: "VIP_PASS" });
  });

  it("PPV is always locked with no CTA kind — dead tier, no unlock path modeled", () => {
    const result = computeLockState(item({ accessLevel: "PPV" }), ctx({ userId: "fan-1", role: "FAN" }));
    expect(result).toEqual({ locked: true, kind: null });
  });
});
