import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db/client";
import { hashPassword, verifyPassword } from "@/lib/auth/session";
import { publicOrigin } from "@/lib/seo/site-url";

/**
 * Integration test (real Postgres) for GET /api/auth/google/callback.
 * Only the network call to Google (exchangeGoogleCode) and the
 * "is Google configured" env check are mocked — account lookup/linking,
 * provisioning, the inactive-account gate, session creation and the
 * redirect/cookie handling all run for real.
 */
const googleProfile = vi.hoisted(() => ({
  current: { email: "", emailVerified: true, name: "Google Person" as string | null, picture: null as string | null },
}));

vi.mock("@/lib/auth/google", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/google")>();
  return {
    ...actual,
    isGoogleAuthConfigured: () => true,
    exchangeGoogleCode: vi.fn(async () => googleProfile.current),
  };
});

import { GET as googleCallback } from "@/app/api/auth/google/callback/route";

let dbAvailable = true;

beforeAll(async () => {
  if (!process.env.AUTH_SECRET) process.env.AUTH_SECRET = "test-secret-at-least-16-chars-long";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    dbAvailable = false;
  }
});

afterAll(async () => {
  if (dbAvailable) await db.$disconnect();
});

const STATE = "test-state-value";

function callbackRequest(query: string, cookies: Record<string, string> = { google_oauth_state: STATE }): NextRequest {
  return new NextRequest(`http://localhost:3000/api/auth/google/callback?${query}`, {
    headers: { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") },
  });
}

function sessionCookie(res: Response): string | undefined {
  return res.headers
    .getSetCookie()
    .find((c) => c.startsWith(`${process.env.SESSION_COOKIE_NAME ?? "baddies_session"}=`) && !c.includes("Max-Age=0"));
}

describe.skipIf(!dbAvailable)("Google sign-in callback (integration)", () => {
  const emails: string[] = [];
  const uniqueEmail = (label: string) => {
    const e = `google-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
    emails.push(e);
    return e;
  };

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: emails } } });
  });

  it("creates a new, already-verified FAN account and signs it in", async () => {
    googleProfile.current = { email: uniqueEmail("new"), emailVerified: true, name: "New Googler", picture: null };

    const res = await googleCallback(callbackRequest(`code=abc&state=${STATE}`));

    expect(res.status).toBe(307);
    // Built from APP_URL, never the request's own (proxy-internal) origin.
    expect(new URL(res.headers.get("location")!).origin).toBe(publicOrigin());
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
    expect(sessionCookie(res)).toBeDefined();

    const user = await db.user.findUnique({
      where: { email: googleProfile.current.email },
      include: { profile: true, wallet: true },
    });
    expect(user?.role).toBe("FAN");
    expect(user?.emailVerified).not.toBeNull();
    expect(user?.profile?.displayName).toBe("New Googler");
    expect(user?.wallet).not.toBeNull();
  });

  it("signs an existing verified account in as-is, honoring a safe returnTo", async () => {
    const email = uniqueEmail("existing");
    const passwordHash = await hashPassword("original-password-123");
    const existing = await db.user.create({
      data: { email, passwordHash, role: "CREATOR", emailVerified: new Date(), profile: { create: { displayName: "Existing" } } },
    });
    googleProfile.current = { email: email.toUpperCase(), emailVerified: true, name: "Ignored", picture: null };

    const res = await googleCallback(
      callbackRequest(`code=abc&state=${STATE}`, { google_oauth_state: STATE, google_oauth_return_to: "/apply" })
    );

    expect(new URL(res.headers.get("location")!).pathname).toBe("/apply");
    expect(sessionCookie(res)).toBeDefined();
    const after = await db.user.findUniqueOrThrow({ where: { id: existing.id } });
    expect(after.role).toBe("CREATOR");
    expect(await verifyPassword("original-password-123", after.passwordHash)).toBe(true);
    expect(await db.user.count({ where: { email: { equals: email, mode: "insensitive" } } })).toBe(1);
  });

  it("retires an unverified account's password and sessions before linking (pre-hijack guard)", async () => {
    const email = uniqueEmail("unverified");
    const squatter = await db.user.create({
      data: { email, passwordHash: await hashPassword("attacker-chosen-pw"), role: "FAN", profile: { create: { displayName: "x" } } },
    });
    const oldSession = await db.session.create({
      data: { userId: squatter.id, tokenHash: "x", expiresAt: new Date(Date.now() + 3600_000) },
    });
    googleProfile.current = { email, emailVerified: true, name: "Real Owner", picture: null };

    const res = await googleCallback(callbackRequest(`code=abc&state=${STATE}`));

    expect(sessionCookie(res)).toBeDefined();
    const after = await db.user.findUniqueOrThrow({ where: { id: squatter.id } });
    expect(after.emailVerified).not.toBeNull();
    expect(await verifyPassword("attacker-chosen-pw", after.passwordHash)).toBe(false);
    expect((await db.session.findUniqueOrThrow({ where: { id: oldSession.id } })).revokedAt).not.toBeNull();
  });

  it("refuses a suspended account", async () => {
    const email = uniqueEmail("suspended");
    await db.user.create({
      data: { email, passwordHash: "x", role: "FAN", isActive: false, emailVerified: new Date() },
    });
    googleProfile.current = { email, emailVerified: true, name: null, picture: null };

    const res = await googleCallback(callbackRequest(`code=abc&state=${STATE}`));

    const location = new URL(res.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("account_inactive");
    expect(sessionCookie(res)).toBeUndefined();
  });

  it("refuses a Google account whose email Google hasn't verified", async () => {
    googleProfile.current = { email: uniqueEmail("gunverified"), emailVerified: false, name: null, picture: null };

    const res = await googleCallback(callbackRequest(`code=abc&state=${STATE}`));

    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("google_email_unverified");
    expect(await db.user.count({ where: { email: googleProfile.current.email } })).toBe(0);
  });

  it("treats a cancelled consent screen as cancelled, not as an error", async () => {
    const res = await googleCallback(callbackRequest(`error=access_denied&state=${STATE}`));
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("google_cancelled");
  });

  it("rejects a mismatched state (CSRF)", async () => {
    const res = await googleCallback(callbackRequest(`code=abc&state=forged`));
    expect(new URL(res.headers.get("location")!).searchParams.get("error")).toBe("google_state_mismatch");
  });

  it("never redirects off-site via a protocol-relative returnTo", async () => {
    googleProfile.current = { email: uniqueEmail("redirect"), emailVerified: true, name: null, picture: null };

    const res = await googleCallback(
      callbackRequest(`code=abc&state=${STATE}`, { google_oauth_state: STATE, google_oauth_return_to: "//evil.example/x" })
    );

    const location = new URL(res.headers.get("location")!);
    expect(location.origin).toBe(publicOrigin());
    expect(location.pathname).toBe("/");
  });
});
