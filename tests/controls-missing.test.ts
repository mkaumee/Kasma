import { afterAll, beforeAll, describe, expect, test } from "vitest";

import {
  detectMissingStatements,
  detectMissingTransactions,
} from "@/lib/controls/missing";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let accountId: string;

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`missing-${crypto.randomUUID()}`);
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
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("detectMissingTransactions", () => {
  test("flags a running-balance gap and clears it once fixed", async () => {
    const statement = await prisma.statement.create({
      data: {
        organizationId: orgId,
        bankAccountId: accountId,
        currency: "USD",
        status: "CONFIRMED",
        source: "UPLOAD",
        openingBalance: 100000n,
        closingBalance: 100000n,
      },
    });
    // Row 2's printed balance drops more than its amount → a gap.
    await prisma.transaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: accountId,
        statementId: statement.id,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Deposit",
        amount: 149550n,
        direction: "CREDIT",
        runningBalance: 249550n,
        currency: "USD",
        dedupeHash: `m1-${crypto.randomUUID()}`,
      },
    });
    await prisma.transaction.create({
      data: {
        organizationId: orgId,
        bankAccountId: accountId,
        statementId: statement.id,
        date: new Date(Date.UTC(2026, 5, 2)),
        description: "Rent",
        amount: -50000n,
        direction: "DEBIT",
        runningBalance: 100000n, // expected 199550 → gap of -99550
        currency: "USD",
        dedupeHash: `m2-${crypto.randomUUID()}`,
      },
    });

    const res = await detectMissingTransactions(orgId, statement.id);
    expect(res.gaps).toBe(1);
    const alert = await prisma.alert.findFirst({
      where: { organizationId: orgId, type: "MISSING_TRANSACTION" },
    });
    expect(alert!.status).toBe("OPEN");
    expect(alert!.severity).toBe("HIGH");

    // Fix the second row's balance → gap closes → alert resolves.
    await prisma.transaction.updateMany({
      where: { statementId: statement.id, description: "Rent" },
      data: { runningBalance: 199550n },
    });
    const res2 = await detectMissingTransactions(orgId, statement.id);
    expect(res2.gaps).toBe(0);
    const resolved = await prisma.alert.findFirst({
      where: { organizationId: orgId, type: "MISSING_TRANSACTION" },
    });
    expect(resolved!.status).toBe("RESOLVED");
  });
});

describe("detectMissingStatements", () => {
  test("flags a balance carry-over gap between statements", async () => {
    const acc = await prisma.bankAccount.create({
      data: {
        organizationId: orgId,
        bankName: "Chase",
        accountName: "Savings",
        currency: "USD",
      },
    });
    await prisma.statement.create({
      data: {
        organizationId: orgId,
        bankAccountId: acc.id,
        currency: "USD",
        status: "CONFIRMED",
        source: "UPLOAD",
        periodStart: new Date(Date.UTC(2026, 5, 1)),
        openingBalance: 0n,
        closingBalance: 100000n,
      },
    });
    const stmt2 = await prisma.statement.create({
      data: {
        organizationId: orgId,
        bankAccountId: acc.id,
        currency: "USD",
        status: "CONFIRMED",
        source: "UPLOAD",
        periodStart: new Date(Date.UTC(2026, 7, 1)), // July skipped
        openingBalance: 150000n, // ≠ 100000 → gap
        closingBalance: 200000n,
      },
    });

    const res = await detectMissingStatements(orgId, acc.id);
    expect(res.gaps).toBe(1);
    const alert = await prisma.alert.findFirst({
      where: {
        organizationId: orgId,
        type: "MISSING_STATEMENT",
        statementId: stmt2.id,
      },
    });
    expect(alert!.status).toBe("OPEN");

    // Correct the opening balance so it carries over → alert resolves.
    await prisma.statement.update({
      where: { id: stmt2.id },
      data: { openingBalance: 100000n },
    });
    const res2 = await detectMissingStatements(orgId, acc.id);
    expect(res2.gaps).toBe(0);
    const resolved = await prisma.alert.findFirst({
      where: {
        organizationId: orgId,
        type: "MISSING_STATEMENT",
        statementId: stmt2.id,
      },
    });
    expect(resolved!.status).toBe("RESOLVED");
  });
});
