import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { createTestOrg, resetDb } from "./helpers/db";

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema", () => {
  test("creates an organization with an owner membership", async () => {
    const org = await createTestOrg("acme-test");
    const user = await prisma.user.create({
      data: { email: "owner@test.dev", name: "Owner" },
    });
    const membership = await prisma.membership.create({
      data: { organizationId: org.id, userId: user.id, role: "OWNER" },
    });

    expect(membership.role).toBe("OWNER");

    const found = await prisma.organization.findUnique({
      where: { id: org.id },
      include: { memberships: true },
    });
    expect(found?.memberships).toHaveLength(1);
  });

  test("stores money as bigint minor units", async () => {
    const org = await createTestOrg("money-test");
    const account = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        bankName: "Chase",
        accountName: "Operating",
        currency: "USD",
        openingBalance: 100_000_000n,
      },
    });
    expect(account.openingBalance).toBe(100_000_000n);
  });

  test("enforces the per-org transaction dedupe hash", async () => {
    const org = await createTestOrg("dedupe-test");
    const account = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        bankName: "Chase",
        accountName: "Operating",
        currency: "USD",
      },
    });
    const base = {
      organizationId: org.id,
      bankAccountId: account.id,
      date: new Date("2026-06-01"),
      description: "Test",
      amount: 1000n,
      direction: "CREDIT" as const,
      currency: "USD",
      dedupeHash: "same-hash",
    };
    await prisma.transaction.create({ data: base });
    await expect(prisma.transaction.create({ data: base })).rejects.toThrow();
  });
});
