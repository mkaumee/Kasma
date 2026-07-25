import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { ledgerWhere, parseLedgerFilters } from "@/lib/transactions/filters";
import { fetchLedgerPage } from "@/lib/transactions/query";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let accountId: string;
let foodCategoryId: string;

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`filters-${crypto.randomUUID()}`);
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
  const food = await prisma.category.create({
    data: { organizationId: orgId, name: "Food" },
  });
  foodCategoryId = food.id;

  await prisma.transaction.createMany({
    data: [
      {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Coffee Shop",
        amount: -450n,
        direction: "DEBIT",
        currency: "USD",
        categoryId: foodCategoryId,
        dedupeHash: `f1-${crypto.randomUUID()}`,
      },
      {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 15)),
        description: "Payroll",
        amount: 500000n,
        direction: "CREDIT",
        currency: "USD",
        dedupeHash: `f2-${crypto.randomUUID()}`,
      },
      {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 6, 1)),
        description: "Office Rent",
        amount: -120000n,
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `f3-${crypto.randomUUID()}`,
      },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function run(query: Record<string, string>) {
  const filters = parseLedgerFilters(query);
  return fetchLedgerPage(orgId, {}, ledgerWhere(filters));
}

describe("ledger filters", () => {
  test("direction", async () => {
    const credits = await run({ direction: "CREDIT" });
    expect(credits.rows.map((r) => r.description)).toEqual(["Payroll"]);
  });

  test("uncategorized vs a category", async () => {
    const none = await run({ category: "none" });
    expect(none.total).toBe(2);
    const food = await run({ category: foodCategoryId });
    expect(food.rows.map((r) => r.description)).toEqual(["Coffee Shop"]);
  });

  test("date range (inclusive)", async () => {
    const june = await run({ from: "2026-06-01", to: "2026-06-30" });
    expect(june.total).toBe(2);
    expect(june.rows.map((r) => r.description)).toContain("Payroll");
  });

  test("amount magnitude minimum ignores sign", async () => {
    const big = await run({ min: "1000" });
    expect(big.rows.map((r) => r.description).sort()).toEqual([
      "Office Rent",
      "Payroll",
    ]);
  });

  test("text search across description", async () => {
    const res = await run({ q: "coffee" });
    expect(res.rows.map((r) => r.description)).toEqual(["Coffee Shop"]);
  });
});
