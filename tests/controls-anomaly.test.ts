import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  detectAnomalies,
  isLargeRoundSum,
  mean,
  stddev,
  zScore,
} from "@/lib/controls/anomaly";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

describe("anomaly pure helpers", () => {
  test("mean / stddev / zScore", () => {
    expect(mean([2, 4, 6])).toBe(4);
    expect(stddev([2, 4, 6], 4)).toBeCloseTo(1.633, 2);
    expect(zScore(10, 4, 2)).toBe(3);
    expect(zScore(10, 4, 0)).toBe(0);
  });

  test("isLargeRoundSum flags whole-thousand amounts", () => {
    expect(isLargeRoundSum(500000n, 2)).toBe(true); // $5,000.00
    expect(isLargeRoundSum(-500000n, 2)).toBe(true);
    expect(isLargeRoundSum(150000n, 2)).toBe(false); // $1,500 not whole-thousand
    expect(isLargeRoundSum(50000n, 2)).toBe(false); // below threshold
    expect(isLargeRoundSum(5000n, 0)).toBe(true); // ¥5,000 (JPY)
  });
});

describe("detectAnomalies", () => {
  let orgId: string;
  let accountId: string;
  let outlierId: string;

  beforeAll(async () => {
    await resetDb();
    const org = await createTestOrg(`anom-${crypto.randomUUID()}`);
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

    // 20 steady payments to Vendor X, then one extreme outlier.
    await prisma.transaction.createMany({
      data: Array.from({ length: 20 }, () => ({
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Vendor X payment",
        counterparty: "Vendor X",
        amount: -1000n,
        direction: "DEBIT" as const,
        currency: "USD",
        dedupeHash: `an-${crypto.randomUUID()}`,
      })),
    });
    const outlier = await prisma.transaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 2)),
        description: "Vendor X payment",
        counterparty: "Vendor X",
        amount: -100000n, // 100x the norm
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `an-out-${crypto.randomUUID()}`,
      },
    });
    outlierId = outlier.id;

    // A large round sum to a one-off counterparty.
    await prisma.transaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: accountId,
        date: new Date(Date.UTC(2026, 5, 3)),
        description: "Wire",
        counterparty: "BigCo",
        amount: -500000n, // $5,000.00 round
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `an-round-${crypto.randomUUID()}`,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("flags a statistical outlier and a large round sum", async () => {
    const res = await detectAnomalies(orgId);
    expect(res.raised).toBeGreaterThanOrEqual(2);

    const anomaly = await prisma.alert.findFirst({
      where: {
        organizationId: orgId,
        type: "ANOMALY",
        transactionId: outlierId,
      },
    });
    expect(anomaly).not.toBeNull();

    const roundSum = await prisma.alert.findFirst({
      where: {
        organizationId: orgId,
        type: "UNUSUAL_ACTIVITY",
        dedupeKey: { startsWith: "roundsum:" },
      },
    });
    expect(roundSum).not.toBeNull();
  });
});
