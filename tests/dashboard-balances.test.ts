import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { applyBalances, getAccountBalances } from "@/lib/dashboard/balances";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

describe("applyBalances (pure)", () => {
  test("adds the per-account transaction sum to opening balance", () => {
    const out = applyBalances(
      [
        { id: "a", openingBalance: 100000n },
        { id: "b", openingBalance: 0n },
      ],
      new Map([
        ["a", 25000n],
        // b has no transactions
      ]),
    );
    expect(out[0]!.currentBalance).toBe(125000n);
    expect(out[1]!.currentBalance).toBe(0n);
  });
});

describe("getAccountBalances", () => {
  let orgId: string;

  beforeAll(async () => {
    await resetDb();
    const org = await createTestOrg(`dash-${crypto.randomUUID()}`);
    orgId = org.id;
    const account = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        bankName: "Chase",
        accountName: "Operating",
        currency: "USD",
        openingBalance: 100000n,
      },
    });
    await prisma.transaction.createMany({
      data: [
        {
          organizationId: orgId,
          bankAccountId: account.id,
          date: new Date(Date.UTC(2026, 5, 1)),
          description: "Salary",
          amount: 50000n,
          direction: "CREDIT",
          currency: "USD",
          dedupeHash: `d1-${crypto.randomUUID()}`,
        },
        {
          organizationId: orgId,
          bankAccountId: account.id,
          date: new Date(Date.UTC(2026, 5, 2)),
          description: "Rent",
          amount: -20000n,
          direction: "DEBIT",
          currency: "USD",
          dedupeHash: `d2-${crypto.randomUUID()}`,
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("computes current balance from opening + transactions", async () => {
    const balances = await getAccountBalances(orgId);
    expect(balances).toHaveLength(1);
    expect(balances[0]!.currentBalance).toBe(130000n); // 100000 + 50000 - 20000
  });
});
