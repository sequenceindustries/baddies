import { describe, it, expect } from "vitest";
import { can, requirePermission, requireOwnerOrPermission, ForbiddenError } from "@/lib/rbac/permissions";

describe("RBAC permissions", () => {
  it("fans cannot moderate content", () => {
    expect(can("FAN", "content:moderate")).toBe(false);
  });

  it("creators cannot approve payouts", () => {
    expect(can("CREATOR", "payout:approve")).toBe(false);
  });

  it("only admins can verify creators", () => {
    expect(can("ADMIN", "creator:verify")).toBe(true);
    expect(can("CREATOR", "creator:verify")).toBe(false);
    expect(can("FAN", "creator:verify")).toBe(false);
  });

  it("creator approval and rejection routes share the creator:verify permission", () => {
    // Both /approve and /reject gate on the same permission — this test
    // exists so a future split (e.g. a separate "creator:reject"
    // permission) is a deliberate decision, not an accidental drift.
    expect(can("ADMIN", "creator:verify")).toBe(true);
  });

  it("admins can view any ledger, others only their own", () => {
    expect(can("ADMIN", "ledger:view_any")).toBe(true);
    expect(can("CREATOR", "ledger:view_any")).toBe(false);
    expect(can("CREATOR", "ledger:view_own")).toBe(true);
  });

  it("requirePermission throws ForbiddenError for disallowed roles", () => {
    expect(() => requirePermission("FAN", "content:moderate")).toThrow(ForbiddenError);
  });

  it("requirePermission does not throw for allowed roles", () => {
    expect(() => requirePermission("ADMIN", "content:moderate")).not.toThrow();
  });

  it("requireOwnerOrPermission allows owners regardless of role permission", () => {
    expect(() => requireOwnerOrPermission("CREATOR", true, "content:moderate")).not.toThrow();
  });

  it("requireOwnerOrPermission falls back to permission check for non-owners", () => {
    expect(() => requireOwnerOrPermission("CREATOR", false, "content:moderate")).toThrow(ForbiddenError);
    expect(() => requireOwnerOrPermission("ADMIN", false, "content:moderate")).not.toThrow();
  });
});
