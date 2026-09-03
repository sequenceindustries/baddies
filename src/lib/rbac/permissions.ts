import type { UserRole } from "@prisma/client";

/**
 * Server-side RBAC. Per build brief §4: "Never rely solely on frontend role
 * checks." Every API route / server action that touches protected data
 * must call `can()` or `requireRole()` from this module — UI-level hiding
 * of buttons is a UX nicety, not a security boundary.
 */

export type Permission =
  | "content:create"
  | "content:publish"
  | "content:moderate"
  | "content:view_any" // bypass entitlement checks (admin only)
  | "creator:apply"
  | "creator:verify" // admin action: approve/reject a creator application
  | "user:suspend"
  | "user:ban"
  | "report:review"
  | "report:file"
  | "payout:request"
  | "payout:approve"
  | "ledger:view_own"
  | "ledger:view_any"
  | "settings:write"
  | "audit:view"
  | "dashboard:view"; // admin-only: aggregate stats + the member directory

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  FAN: ["creator:apply", "report:file", "ledger:view_own"],
  CREATOR: [
    "creator:apply",
    "content:create",
    "content:publish",
    "report:file",
    "payout:request",
    "ledger:view_own",
  ],
  ADMIN: [
    "content:moderate",
    "content:view_any",
    "creator:verify",
    "user:suspend",
    "user:ban",
    "report:review",
    "report:file",
    "payout:approve",
    "ledger:view_any",
    "settings:write",
    "audit:view",
    "dashboard:view",
  ],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Forbidden: role lacks permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}

/** Throws if the given role lacks the permission. Call this at the top of every protected handler. */
export function requirePermission(role: UserRole, permission: Permission): void {
  if (!can(role, permission)) {
    throw new ForbiddenError(permission);
  }
}

/**
 * Ownership check helper — many actions (e.g. a creator editing their own
 * content) need role permission AND resource ownership. Permission alone
 * is not sufficient.
 */
export function requireOwnerOrPermission(
  role: UserRole,
  isOwner: boolean,
  fallbackPermission: Permission
): void {
  if (isOwner) return;
  requirePermission(role, fallbackPermission);
}
