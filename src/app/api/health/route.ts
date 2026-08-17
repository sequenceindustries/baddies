import { NextResponse } from "next/server";

/**
 * Deliberately does NOT touch the database — a DB outage shouldn't make
 * the load balancer consider the app itself unhealthy and start cycling
 * containers. Add a separate /api/health/db if deep health checks are
 * ever needed.
 */
export async function GET() {
  return NextResponse.json({ status: "ok" });
}
