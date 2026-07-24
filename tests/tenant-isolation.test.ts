import { afterAll, beforeEach, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { assertSameOrg, tenantDb } from "@/lib/db/tenant";
import { resetDb } from "./helpers/db";

beforeEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function seedTwoOrgs() {
  const orgA = await prisma.organization.create({
    data: { name: "Org A", slug: `a-${crypto.randomUUID()}` },
  });
  const orgB = await prisma.organization.create({
    data: { name: "Org B", slug: `b-${crypto.randomUUID()}` },
  });
  const acctA = await prisma.bankAccount.create({
    data: {
      organizationId: orgA.id,
      bankName: "A Bank",
      accountName: "A Ops",
      currency: "USD",
    },
  });
  const acctB = await prisma.bankAccount.create({
    data: {
      organizationId: orgB.id,
      bankName: "B Bank",
      accountName: "B Ops",
      currency: "USD",
    },
  });
  return { orgA, orgB, acctA, acctB };
}

describe("tenant isolation", () => {
  test("findMany only returns the active org's rows", async () => {
    const { orgA, acctA } = await seedTwoOrgs();
    const rows = await tenantDb(orgA.id).bankAccount.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe(acctA.id);
  });

  test("cannot read another org's row by id", async () => {
    const { orgA, acctB } = await seedTwoOrgs();
    const leaked = await tenantDb(orgA.id).bankAccount.findFirst({
      where: { id: acctB.id },
    });
    expect(leaked).toBeNull();
  });

  test("count is scoped to the active org", async () => {
    const { orgA } = await seedTwoOrgs();
    expect(await tenantDb(orgA.id).bankAccount.count()).toBe(1);
  });

  test("create injects the active org and never crosses tenants", async () => {
    const { orgA, orgB } = await seedTwoOrgs();
    const created = await tenantDb(orgA.id).bankAccount.create({
      bankName: "New",
      accountName: "New Ops",
      currency: "USD",
    });
    expect(created.organizationId).toBe(orgA.id);
    expect(await tenantDb(orgA.id).bankAccount.count()).toBe(2);
    expect(await tenantDb(orgB.id).bankAccount.count()).toBe(1);
  });

  test("assertSameOrg throws for a foreign record", async () => {
    const { orgA, acctB } = await seedTwoOrgs();
    expect(() => assertSameOrg(orgA.id, acctB)).toThrow(
      "Cross-tenant access denied",
    );
    // ...and passes for a same-org record.
    const acctA = await tenantDb(orgA.id).bankAccount.findFirst();
    expect(() => assertSameOrg(orgA.id, acctA)).not.toThrow();
  });
});
