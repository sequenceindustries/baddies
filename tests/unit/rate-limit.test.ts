import { describe, it, expect } from "vitest";
import { checkRateLimit, checkRateLimitByIp } from "@/lib/security/rate-limit";

describe("checkRateLimit", () => {
  it("allows requests up to the limit, then blocks the next one", () => {
    const key = `test-${Date.now()}-a`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 3, 60).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keeps separate buckets for different keys", () => {
    const keyA = `test-${Date.now()}-b1`;
    const keyB = `test-${Date.now()}-b2`;
    expect(checkRateLimit(keyA, 1, 60).allowed).toBe(true);
    expect(checkRateLimit(keyA, 1, 60).allowed).toBe(false); // keyA now exhausted
    expect(checkRateLimit(keyB, 1, 60).allowed).toBe(true); // keyB is unaffected
  });

  it("resets after the window elapses", async () => {
    const key = `test-${Date.now()}-c`;
    expect(checkRateLimit(key, 1, 0.05).allowed).toBe(true); // 50ms window
    expect(checkRateLimit(key, 1, 0.05).allowed).toBe(false);
    await new Promise((r) => setTimeout(r, 80));
    expect(checkRateLimit(key, 1, 0.05).allowed).toBe(true);
  });
});

describe("checkRateLimitByIp", () => {
  it("derives the bucket key from the request's x-forwarded-for header, isolating different IPs", () => {
    const routeKey = `test-route-${Date.now()}`;
    const reqA = new Request("http://localhost/test", { headers: { "x-forwarded-for": "1.2.3.4" } });
    const reqB = new Request("http://localhost/test", { headers: { "x-forwarded-for": "5.6.7.8" } });

    expect(checkRateLimitByIp(reqA, routeKey, 1, 60).allowed).toBe(true);
    expect(checkRateLimitByIp(reqA, routeKey, 1, 60).allowed).toBe(false); // same IP, exhausted
    expect(checkRateLimitByIp(reqB, routeKey, 1, 60).allowed).toBe(true); // different IP, fresh bucket
  });
});
