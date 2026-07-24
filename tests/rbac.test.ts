import { describe, expect, test } from "vitest";

import { can, hasAtLeast, roleLabel } from "@/lib/auth/rbac";

describe("rbac", () => {
  test("role hierarchy", () => {
    expect(hasAtLeast("OWNER", "VIEWER")).toBe(true);
    expect(hasAtLeast("ADMIN", "ADMIN")).toBe(true);
    expect(hasAtLeast("VIEWER", "ADMIN")).toBe(false);
    expect(hasAtLeast("ACCOUNTANT", "OWNER")).toBe(false);
  });

  test("permission checks", () => {
    // Viewers are read-only.
    expect(can("VIEWER", "accounts:write")).toBe(false);
    expect(can("VIEWER", "members:manage")).toBe(false);

    // Accountants can manage financial data but not members/org.
    expect(can("ACCOUNTANT", "accounts:write")).toBe(true);
    expect(can("ACCOUNTANT", "transactions:write")).toBe(true);
    expect(can("ACCOUNTANT", "members:manage")).toBe(false);

    // Admins/owners can manage members and the org.
    expect(can("ADMIN", "members:manage")).toBe(true);
    expect(can("OWNER", "org:manage")).toBe(true);
  });

  test("role labels", () => {
    expect(roleLabel("OWNER")).toBe("Owner");
    expect(roleLabel("ACCOUNTANT")).toBe("Accountant");
  });
});
