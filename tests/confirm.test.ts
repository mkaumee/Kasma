import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { confirmStatement, prepareReparse } from "@/lib/statements/confirm";

import { createTestOrg, resetDb } from "./helpers/db";

async function seedAccount(organizationId: string) {
  return prisma.bankAccount.create({
    data: {
      organizationId,
      bankName: "Chase",
      accountName: "Operating",
      currency: "USD",
      openingBalance: 100000n,
    },
  });
}

function txnData(
  organizationId: string,
  bankAccountId: string,
  statementId: string,
) {
  return {
    organizationId,
    bankAccountId,
    statementId,
    date: new Date(Date.UTC(2026, 5, 1)),
    description: "Salary",
    amount: 149550n,
    direction: "CREDIT" as const,
    runningBalance: 249550n,
    currency: "USD",
    dedupeHash: `h-${crypto.randomUUID()}`,
  };
}

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("confirmStatement", () => {
  test("confirms a reconciling statement and trusts its template", async () => {
    const org = await createTestOrg(`confirm-${crypto.randomUUID()}`);
    const account = await seedAccount(org.id);
    const template = await prisma.statementTemplate.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        signature: `csv|amount:2,date:0`,
        parserUsed: "csv",
      },
    });
    const statement = await prisma.statement.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        currency: "USD",
        status: "PARSED",
        source: "UPLOAD",
        openingBalance: 100000n,
        closingBalance: 249550n,
        statementTemplateId: template.id,
      },
    });
    await prisma.transaction.create({
      data: txnData(org.id, account.id, statement.id),
    });

    const res = await confirmStatement(org.id, statement.id);
    expect(res.ok).toBe(true);

    const updated = await prisma.statement.findUnique({
      where: { id: statement.id },
    });
    expect(updated!.status).toBe("CONFIRMED");

    const trusted = await prisma.statementTemplate.findUnique({
      where: { id: template.id },
    });
    expect(trusted!.trusted).toBe(true);
  });

  test("refuses to confirm a statement with no transactions", async () => {
    const org = await createTestOrg(`confirm-empty-${crypto.randomUUID()}`);
    const account = await seedAccount(org.id);
    const statement = await prisma.statement.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        currency: "USD",
        status: "NEEDS_REVIEW",
        source: "UPLOAD",
      },
    });
    const res = await confirmStatement(org.id, statement.id);
    expect(res.error).toMatch(/no transactions/i);
  });
});

describe("prepareReparse", () => {
  test("clears transactions and re-queues the statement", async () => {
    const org = await createTestOrg(`reparse-${crypto.randomUUID()}`);
    const account = await seedAccount(org.id);
    const statement = await prisma.statement.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        currency: "USD",
        status: "FAILED",
        source: "UPLOAD",
        fileKey: `orgs/${org.id}/statements/x/june.csv`,
        parserUsed: "csv",
        confidence: 0.3,
        importJobs: { create: { organizationId: org.id, status: "FAILED" } },
      },
    });
    await prisma.transaction.create({
      data: txnData(org.id, account.id, statement.id),
    });

    const res = await prepareReparse(org.id, statement.id);
    expect(res.ok).toBe(true);

    const updated = await prisma.statement.findUnique({
      where: { id: statement.id },
    });
    expect(updated!.status).toBe("QUEUED");
    expect(updated!.parserUsed).toBeNull();
    expect(updated!.confidence).toBeNull();
    expect(
      await prisma.transaction.count({ where: { statementId: statement.id } }),
    ).toBe(0);
    const job = await prisma.importJob.findFirst({
      where: { statementId: statement.id },
    });
    expect(job!.status).toBe("QUEUED");
  });

  test("protects a confirmed statement from re-parsing", async () => {
    const org = await createTestOrg(`reparse-guard-${crypto.randomUUID()}`);
    const account = await seedAccount(org.id);
    const statement = await prisma.statement.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        currency: "USD",
        status: "CONFIRMED",
        source: "UPLOAD",
        fileKey: `orgs/${org.id}/statements/y/june.csv`,
      },
    });
    const res = await prepareReparse(org.id, statement.id);
    expect(res.error).toMatch(/can't be re-parsed/i);
  });
});
