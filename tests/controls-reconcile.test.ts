import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { reconcileStatementRecord } from "@/lib/controls/reconcile";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let accountId: string;

async function makeStatement(closingBalance: bigint) {
  const statement = await prisma.statement.create({
    data: {
      organizationId: orgId,
      bankAccountId: accountId,
      currency: "USD",
      status: "CONFIRMED",
      source: "UPLOAD",
      openingBalance: 100000n,
      closingBalance,
    },
  });
  await prisma.transaction.create({
    data: {
      organizationId: orgId,
      bankAccountId: accountId,
      statementId: statement.id,
      date: new Date(Date.UTC(2026, 5, 1)),
      description: "Salary",
      amount: 149550n,
      direction: "CREDIT",
      runningBalance: 249550n,
      currency: "USD",
      dedupeHash: `s-${crypto.randomUUID()}`,
    },
  });
  return statement;
}

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`recon-${crypto.randomUUID()}`);
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

describe("reconcileStatementRecord", () => {
  test("a balanced statement records BALANCED and raises no alert", async () => {
    const statement = await makeStatement(249550n);
    const res = await reconcileStatementRecord(orgId, statement.id);
    expect(res.status).toBe("BALANCED");
    expect(res.delta).toBe(0n);

    const recon = await prisma.reconciliation.findUnique({
      where: { statementId: statement.id },
    });
    expect(recon!.status).toBe("BALANCED");

    const alerts = await prisma.alert.count({
      where: { organizationId: orgId, statementId: statement.id, status: "OPEN" },
    });
    expect(alerts).toBe(0);
  });

  test("a mismatch records MISMATCH and raises a deduped alert", async () => {
    const statement = await makeStatement(200000n); // computed is 249550
    const res = await reconcileStatementRecord(orgId, statement.id);
    expect(res.status).toBe("MISMATCH");
    expect(res.delta).toBe(49550n);

    // Re-running does not create a second alert.
    await reconcileStatementRecord(orgId, statement.id);
    const alerts = await prisma.alert.findMany({
      where: {
        organizationId: orgId,
        statementId: statement.id,
        type: "BALANCE_MISMATCH",
      },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.severity).toBe("HIGH");
    expect(alerts[0]!.status).toBe("OPEN");
  });

  test("fixing the balance auto-resolves the alert", async () => {
    const statement = await makeStatement(200000n);
    await reconcileStatementRecord(orgId, statement.id);

    await prisma.statement.update({
      where: { id: statement.id },
      data: { closingBalance: 249550n },
    });
    const res = await reconcileStatementRecord(orgId, statement.id);
    expect(res.status).toBe("BALANCED");

    const alert = await prisma.alert.findFirst({
      where: {
        organizationId: orgId,
        statementId: statement.id,
        type: "BALANCE_MISMATCH",
      },
    });
    expect(alert!.status).toBe("RESOLVED");
  });
});
