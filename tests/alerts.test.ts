import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { setAlertStatus } from "@/lib/alerts/service";
import { runControlsForStatement } from "@/lib/controls/run";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let userId: string;
let accountId: string;

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`alerts-${crypto.randomUUID()}`);
  orgId = org.id;
  const user = await prisma.user.create({
    data: { email: `u-${crypto.randomUUID()}@test.dev`, name: "Ana" },
  });
  userId = user.id;
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

describe("setAlertStatus", () => {
  async function makeAlert() {
    return prisma.alert.create({
      data: {
        organizationId: orgId,
        type: "ANOMALY",
        severity: "MEDIUM",
        title: "Test",
        dedupeKey: `k-${crypto.randomUUID()}`,
      },
    });
  }

  test("resolve records who/when; reopen clears it", async () => {
    const alert = await makeAlert();
    const r = await setAlertStatus(orgId, userId, alert.id, "RESOLVED");
    expect(r.ok).toBe(true);
    let row = await prisma.alert.findUnique({ where: { id: alert.id } });
    expect(row!.status).toBe("RESOLVED");
    expect(row!.resolvedById).toBe(userId);
    expect(row!.resolvedAt).not.toBeNull();

    await setAlertStatus(orgId, userId, alert.id, "OPEN");
    row = await prisma.alert.findUnique({ where: { id: alert.id } });
    expect(row!.status).toBe("OPEN");
    expect(row!.resolvedById).toBeNull();
    expect(row!.resolvedAt).toBeNull();
  });

  test("dismiss sets DISMISSED", async () => {
    const alert = await makeAlert();
    await setAlertStatus(orgId, userId, alert.id, "DISMISSED");
    const row = await prisma.alert.findUnique({ where: { id: alert.id } });
    expect(row!.status).toBe("DISMISSED");
  });

  test("cannot touch another org's alert", async () => {
    const alert = await makeAlert();
    const other = await createTestOrg(`other-${crypto.randomUUID()}`);
    const res = await setAlertStatus(other.id, userId, alert.id, "RESOLVED");
    expect(res.error).toBeDefined();
  });
});

describe("runControlsForStatement", () => {
  test("produces a reconciliation record and a balance alert", async () => {
    const statement = await prisma.statement.create({
      data: {
        organizationId: orgId,
        bankAccountId: accountId,
        currency: "USD",
        status: "CONFIRMED",
        source: "UPLOAD",
        openingBalance: 100000n,
        closingBalance: 200000n, // computed will be 249550 → mismatch
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
        currency: "USD",
        dedupeHash: `ctrl-${crypto.randomUUID()}`,
      },
    });

    await runControlsForStatement(orgId, statement.id);

    const recon = await prisma.reconciliation.findUnique({
      where: { statementId: statement.id },
    });
    expect(recon!.status).toBe("MISMATCH");

    const alert = await prisma.alert.findFirst({
      where: {
        organizationId: orgId,
        type: "BALANCE_MISMATCH",
        statementId: statement.id,
        status: "OPEN",
      },
    });
    expect(alert).not.toBeNull();
  });
});
