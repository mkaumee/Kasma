import type { Role } from "@prisma/client";

// This module is intentionally pure (no server-only imports) so it is safe to
// import from client components and unit tests. The async `requirePermission`
// guard lives in lib/auth/guards.ts.

/** Role hierarchy: higher rank implies all lower-rank capabilities. */
const RANK: Record<Role, number> = {
  VIEWER: 0,
  ACCOUNTANT: 1,
  ADMIN: 2,
  OWNER: 3,
};

export type Permission =
  | "org:manage"
  | "members:manage"
  | "accounts:write"
  | "statements:write"
  | "transactions:write"
  | "alerts:manage";

/** Minimum role required for each permission. */
const MIN_ROLE: Record<Permission, Role> = {
  "org:manage": "ADMIN",
  "members:manage": "ADMIN",
  "accounts:write": "ACCOUNTANT",
  "statements:write": "ACCOUNTANT",
  "transactions:write": "ACCOUNTANT",
  "alerts:manage": "ACCOUNTANT",
};

/** True if `role` ranks at or above `min`. */
export function hasAtLeast(role: Role, min: Role): boolean {
  return RANK[role] >= RANK[min];
}

/** True if `role` is allowed to perform `permission`. */
export function can(role: Role, permission: Permission): boolean {
  return hasAtLeast(role, MIN_ROLE[permission]);
}

export function roleLabel(role: Role): string {
  const labels: Record<Role, string> = {
    OWNER: "Owner",
    ADMIN: "Admin",
    ACCOUNTANT: "Accountant",
    VIEWER: "Viewer",
  };
  return labels[role];
}

export class ForbiddenError extends Error {
  constructor(permission: Permission) {
    super(`Missing permission: ${permission}`);
    this.name = "ForbiddenError";
  }
}
