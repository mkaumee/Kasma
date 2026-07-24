import { requireOrg } from "@/lib/auth/session";
import { can, ForbiddenError, type Permission } from "@/lib/auth/rbac";

/**
 * Require the active user to hold `permission` in their active org. Returns the
 * org context on success; throws ForbiddenError otherwise. Defense-in-depth for
 * server actions and route handlers (paired with UI-level gating).
 */
export async function requirePermission(permission: Permission) {
  const ctx = await requireOrg();
  if (!can(ctx.role, permission)) {
    throw new ForbiddenError(permission);
  }
  return ctx;
}
