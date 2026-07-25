import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { matchInternalTransfers } from "@/lib/controls/transfers";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let accA: string;
let accB: string;

async function txn(
  bankAccountId: string,
  day: number,
  amount: bigint,
  description: string,
) {
  return prisma.transaction.create({
    data: {
      organizationId: orgId,
      bankAccountId,
      date: new Date(Date.UTC(2026, 5, day)),
      description,
      amount,
      direction: amount < 0n ? "DEBIT" : "CREDIT",
      currency: "USD",
      dedupeHash: `t-${crypto.randomUUID()}`,
    },
  });
}

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`xfer-${crypto.randomUUID()}`);
  orgId = org.id;
  const a = await prisma.bankAccount.create({
    data: {
      organizationId: orgId,
      bankName: "Chase",
      accountName: "Operating",
      currency: "USD",
    },
  });
  const b = await prisma.bankAccount.create({
    data: {
      organizationId: orgId,
      bankName: "Chase",
      accountName: "Savings",
      currency: "USD",
    },
  });
  accA = a.id;
  accB = b.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("matchInternalTransfers", () => {
  test("pairs an equal opposite transfer across accounts and is idempotent", async () => {
    const out = await txn(accA, 1, -50000n, "Transfer to savings");
    const inn = await txn(accB, 2, 50000n, "Transfer from operating");
    // A non-transfer that shouldn't match (no opposite counterpart).
    await txn(accA, 1, -12345n, "Coffee");
    // Opposite amounts within the SAME account must not match.
    await txn(accA, 3, -900n, "Fee");
    await txn(accA, 3, 900n, "Fee reversal");

    const res = await matchInternalTransfers(orgId);
    expect(res.pairs).toBe(1);

    const [oa, ia] = await Promise.all([
      prisma.transaction.findUnique({ where: { id: out.id } }),
      prisma.transaction.findUnique({ where: { id: inn.id } }),
    ]);
    expect(oa!.isInternalTransfer).toBe(true);
    expect(oa!.matchedTransferId).toBe(inn.id);
    expect(ia!.matchedTransferId).toBe(out.id);

    const matchedEvents = await prisma.transactionEvent.count({
      where: { organizationId: orgId, kind: "MATCHED" },
    });
    expect(matchedEvents).toBe(2);

    // Re-running matches nothing new.
    const again = await matchInternalTransfers(orgId);
    expect(again.pairs).toBe(0);

    // Same-account opposites were not paired.
    const fee = await prisma.transaction.findFirst({
      where: { organizationId: orgId, description: "Fee" },
    });
    expect(fee!.isInternalTransfer).toBe(false);
  });

  test("does not match outside the date window", async () => {
    const org = await createTestOrg(`xfer2-${crypto.randomUUID()}`);
    const a = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        bankName: "X",
        accountName: "A",
        currency: "USD",
      },
    });
    const b = await prisma.bankAccount.create({
      data: {
        organizationId: org.id,
        bankName: "X",
        accountName: "B",
        currency: "USD",
      },
    });
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        bankAccountId: a.id,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Out",
        amount: -7000n,
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `w1-${crypto.randomUUID()}`,
      },
    });
    await prisma.transaction.create({
      data: {
        organizationId: org.id,
        bankAccountId: b.id,
        date: new Date(Date.UTC(2026, 5, 20)), // 19 days later
        description: "In",
        amount: 7000n,
        direction: "CREDIT",
        currency: "USD",
        dedupeHash: `w2-${crypto.randomUUID()}`,
      },
    });
    const res = await matchInternalTransfers(org.id, { windowDays: 3 });
    expect(res.pairs).toBe(0);
  });
});
