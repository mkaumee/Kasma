import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyBulkCategorize } from "@/lib/categories/bulk";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let accountId: string;
let travelId: string;

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`cat-${crypto.randomUUID()}`);
  orgId = org.id;
  const account = await prisma.bankAccount.create({
    data: {
      organizationId: orgId,
      bankName: "Chase",
      accountName: "Operating",
      currency: "USD",
    },
  });
  accountId = account.id;
  const travel = await prisma.category.create({
    data: { organizationId: orgId, name: "Travel" },
  });
  travelId = travel.id;

  await prisma.transaction.createMany({
    data: [
      {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Uber ride",
        amount: -2000n,
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `c1-${crypto.randomUUID()}`,
      },
      {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 2)),
        description: "Uber eats",
        amount: -3000n,
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `c2-${crypto.randomUUID()}`,
      },
      {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 3)),
        description: "Payroll",
        amount: 500000n,
        direction: "CREDIT",
        currency: "USD",
        dedupeHash: `c3-${crypto.randomUUID()}`,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("applyBulkCategorize", () => {
  test("categorizes only the filtered matches and records events", async () => {
    const { count } = await applyBulkCategorize(
      orgId,
      null,
      { q: "uber" },
      travelId,
    );
    expect(count).toBe(2);

    const travel = await prisma.transaction.findMany({
      where: { organizationId: orgId, categoryId: travelId },
    });
    expect(travel.map((t) => t.description).sort()).toEqual([
      "Uber eats",
      "Uber ride",
    ]);

    const payroll = await prisma.transaction.findFirst({
      where: { organizationId: orgId, description: "Payroll" },
    });
    expect(payroll!.categoryId).toBeNull();

    const events = await prisma.transactionEvent.count({
      where: { organizationId: orgId, kind: "CATEGORIZED" },
    });
    expect(events).toBe(2);
  });

  test("clearing a category sets it back to null", async () => {
    const { count } = await applyBulkCategorize(
      orgId,
      null,
      { q: "uber" },
      null,
    );
    expect(count).toBe(2);
    const stillTravel = await prisma.transaction.count({
      where: { organizationId: orgId, categoryId: travelId },
    });
    expect(stillTravel).toBe(0);
  });
});
