import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { requirePermission, ForbiddenError } from "@/lib/rbac/permissions";
import { db } from "@/lib/db/client";

// Always dynamic: this route reads live data and must never be
// statically prerendered or cached at build time.
export const dynamic = "force-dynamic";

/**
 * Spec §15 — a real, honest snapshot, not a fabricated "all green"
 * board. `/api/health` (the public, load-balancer-facing check)
 * deliberately skips the database per its own comment ("a DB outage
 * shouldn't make the load balancer consider the app itself unhealthy
 * ... add a separate /api/health/db if deep health checks are ever
 * needed") — this admin-only route is exactly that deeper check,
 * correctly scoped behind auth instead of on the public path.
 *
 * Failed background jobs / a system error log / notification delivery
 * failures are NOT reported here — none of those exist in this
 * codebase (no job queue, no error-log table, no email provider is
 * wired up at all). They're listed under `notImplemented` instead of
 * a fabricated zero.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  try {
    requirePermission(user.role, "dashboard:view");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    throw err;
  }

  const dbStart = Date.now();
  let database: { connected: boolean; latencyMs: number | null; error: string | null };
  try {
    await db.$queryRaw`SELECT 1`;
    database = { connected: true, latencyMs: Date.now() - dbStart, error: null };
  } catch (err) {
    database = { connected: false, latencyMs: null, error: err instanceof Error ? err.message : "Unknown error" };
  }

  let appVersion = "unknown";
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8"));
    appVersion = pkg.version ?? "unknown";
  } catch {
    // package.json unreadable in this environment — leave as "unknown"
    // rather than fail the whole health check over a cosmetic field.
  }

  const provider = (name: string | undefined) => ({ name: name ?? "(not set)", isStub: (name ?? "").toLowerCase() === "stub" });

  return NextResponse.json({
    database,
    runtime: {
      nodeVersion: process.version,
      appVersion,
      uptimeSeconds: Math.round(process.uptime()),
      nodeEnv: process.env.NODE_ENV ?? "unknown",
    },
    launchMode: process.env.LAUNCH_MODE === "coming_soon" ? "coming_soon" : "live (public site is up)",
    providers: {
      payment: provider(process.env.PAYMENT_PROVIDER),
      storage: provider(process.env.MEDIA_STORAGE_PROVIDER),
      verification: provider(process.env.VERIFICATION_PROVIDER),
    },
    notImplemented: [
      { label: "Failed background jobs", reason: "No job queue system exists in this codebase." },
      { label: "Recent system errors", reason: "No error-logging table exists — nothing to query." },
      { label: "Notification / email delivery failures", reason: "No email provider is wired up yet, so nothing has ever been sent to fail." },
    ],
  });
}
