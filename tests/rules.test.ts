import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { applyCategorizationRules, matchesRule } from "@/lib/rules/engine";

import { createTestOrg, resetDb } from "./helpers/db";

describe("matchesRule (pure)", () => {
  const base = {
    description: "UBER RIDE",
    counterparty: null,
    reference: null,
    direction: "DEBIT" as const,
  };

  test("contains / equals / startsWith are case-insensitive", () => {
    expect(matchesRule(base, { field: "description", op: "contains", value: "uber" })).toBe(true);
    expect(matchesRule(base, { field: "description", op: "equals", value: "uber ride" })).toBe(true);
    expect(matchesRule(base, { field: "description", op: "startsWith", value: "uber" })).toBe(true);
    expect(matchesRule(base, { field: "description", op: "contains", value: "lyft" })).toBe(false);
  });

  test("direction constraint", () => {
    expect(
      matchesRule(base, { field: "description", op: "contains", value: "uber", direction: "CREDIT" }),
    ).toBe(false);
    expect(
      matchesRule(base, { field: "description", op: "contains", value: "uber", direction: "DEBIT" }),
    ).toBe(true);
  });
});

describe("applyCategorizationRules", () => {
  let orgId: string;
  let travelId: string;
  let otherId: string;
  let manualId: string;

  beforeAll(async () => {
    await resetDb();
    const org = await createTestOrg(`rules-${crypto.randomUUID()}`);
    orgId = org.id;
    const account = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        bankName: "Chase",
        accountName: "Operating",
        currency: "USD",
      },
    });
    const travel = await prisma.category.create({
      data: { organizationId: orgId, name: "Travel" },
    });
    travelId = travel.id;
    const other = await prisma.category.create({
      data: { organizationId: orgId, name: "Other" },
    });
    otherId = other.id;
    const manual = await prisma.category.create({
      data: { organizationId: orgId, name: "Manual" },
    });
    manualId = manual.id;

    // Higher priority "uber" → Travel; lower priority "ride" → Other.
    await prisma.rule.create({
      data: {
        organizationId: orgId,
        type: "CATEGORIZATION",
        name: "Uber",
        priority: 10,
        matcher: { field: "description", op: "contains", value: "uber" },
        action: { type: "categorize", categoryId: travelId },
      },
    });
    await prisma.rule.create({
      data: {
        organizationId: orgId,
        type: "CATEGORIZATION",
        name: "Ride",
        priority: 1,
        matcher: { field: "description", op: "contains", value: "ride" },
        action: { type: "categorize", categoryId: otherId },
      },
    });

    const mk = (description: string, categoryId?: string) => ({
      organizationId: orgId,
      bankAccountId: account.id,
      date: new Date(Date.UTC(2026, 5, 1)),
      description,
      amount: -1000n,
      direction: "DEBIT" as const,
      currency: "USD",
      categoryId,
      dedupeHash: `r-${crypto.randomUUID()}`,
    });
    await prisma.transaction.create({ data: mk("Uber ride to airport") });
    await prisma.transaction.create({ data: mk("Coffee shop") });
    // Already categorized manually — must be preserved.
    await prisma.transaction.create({ data: mk("Uber eats dinner", manualId) });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("highest-priority rule wins and manual categories are preserved", async () => {
    const { count } = await applyCategorizationRules(orgId, {
      onlyUncategorized: true,
    });
    expect(count).toBe(1); // only "Uber ride to airport"

    const uber = await prisma.transaction.findFirst({
      where: { organizationId: orgId, description: "Uber ride to airport" },
    });
    expect(uber!.categoryId).toBe(travelId); // priority 10 beats "ride" → Other

    const coffee = await prisma.transaction.findFirst({
      where: { organizationId: orgId, description: "Coffee shop" },
    });
    expect(coffee!.categoryId).toBeNull();

    const manual = await prisma.transaction.findFirst({
      where: { organizationId: orgId, description: "Uber eats dinner" },
    });
    expect(manual!.categoryId).toBe(manualId); // untouched
  });
});
