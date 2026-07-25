import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { processStatement } from "@/lib/extraction/pipeline";
import { getStorage } from "@/lib/storage";
import { statementFileKey } from "@/lib/storage/keys";

import { createTestOrg, resetDb } from "./helpers/db";

const GOOD_CSV = `Date,Description,Amount,Balance
2026-06-01,Coffee Shop,-4.50,995.50
2026-06-02,Payroll Salary,2000.00,2995.50
2026-06-03,Office Rent,-500.00,2495.50
`;

// Row 3's printed balance drops $1000 but the amount is only -$500 → a $500
// gap the running-balance oracle must catch.
const CORRUPTED_CSV = `Date,Description,Amount,Balance
2026-06-01,Coffee Shop,-4.50,995.50
2026-06-02,Payroll Salary,2000.00,2995.50
2026-06-03,Office Rent,-500.00,1995.50
`;

const storedKeys: string[] = [];

async function createOrg() {
  return createTestOrg(`pipe-${crypto.randomUUID()}`);
}

async function seedStatement(
  organizationId: string,
  bankAccountId: string,
  csv: string,
  filename: string,
): Promise<string> {
  const statement = await prisma.statement.create({
    data: {
      organizationId,
      bankAccountId,
      currency: "USD",
      status: "QUEUED",
      source: "UPLOAD",
      originalFilename: filename,
      importJobs: { create: { organizationId, status: "QUEUED" } },
    },
  });
  const key = statementFileKey(organizationId, statement.id, filename);
  await getStorage().put(key, Buffer.from(csv, "utf-8"), {
    contentType: "text/csv",
  });
  storedKeys.push(key);
  await prisma.statement.update({
    where: { id: statement.id },
    data: { fileKey: key },
  });
  return statement.id;
}

async function makeAccount(organizationId: string) {
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

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await Promise.all(storedKeys.map((k) => getStorage().delete(k).catch(() => {})));
  await prisma.$disconnect();
});

describe("processStatement (end-to-end)", () => {
  test("ingests a clean CSV into validated transactions with audit events", async () => {
    const org = await createOrg();
    const account = await makeAccount(org.id);
    const statementId = await seedStatement(
      org.id,
      account.id,
      GOOD_CSV,
      "june.csv",
    );

    const result = await processStatement(statementId, org.id);

    expect(result.status).toBe("PARSED");
    expect(result.parser).toBe("csv");
    expect(result.inserted).toBe(3);
    expect(result.breaks).toBe(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.95);

    const txns = await prisma.transaction.findMany({
      where: { organizationId: org.id, statementId },
      orderBy: { date: "asc" },
    });
    expect(txns).toHaveLength(3);
    expect(txns[0]!.amount).toBe(-450n);
    expect(txns[0]!.direction).toBe("DEBIT");
    expect(txns[0]!.runningBalance).toBe(99550n);
    expect(txns[1]!.amount).toBe(200000n);
    expect(txns[1]!.direction).toBe("CREDIT");

    // Statement metadata updated.
    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
    });
    expect(statement!.status).toBe("PARSED");
    expect(statement!.parserUsed).toBe("csv");
    expect(statement!.confidence).toBeGreaterThanOrEqual(0.95);

    // Import job succeeded.
    const job = await prisma.importJob.findFirst({ where: { statementId } });
    expect(job!.status).toBe("SUCCEEDED");
    expect(job!.finishedAt).not.toBeNull();

    // Each transaction has an immutable CREATED audit event.
    const events = await prisma.transactionEvent.findMany({
      where: { organizationId: org.id, kind: "CREATED" },
    });
    expect(events).toHaveLength(3);
  });

  test("a re-upload of the same statement inserts no duplicate transactions", async () => {
    const org = await createOrg();
    const account = await makeAccount(org.id);

    const first = await seedStatement(org.id, account.id, GOOD_CSV, "june.csv");
    const firstResult = await processStatement(first, org.id);
    expect(firstResult.inserted).toBe(3);

    const second = await seedStatement(
      org.id,
      account.id,
      GOOD_CSV,
      "june-again.csv",
    );
    const secondResult = await processStatement(second, org.id);
    expect(secondResult.inserted).toBe(0);
    expect(secondResult.duplicates).toBe(3);

    // Still only 3 transactions for the account.
    const count = await prisma.transaction.count({
      where: { organizationId: org.id, bankAccountId: account.id },
    });
    expect(count).toBe(3);
  });

  test("a broken running balance routes the statement to NEEDS_REVIEW", async () => {
    const org = await createOrg();
    const account = await makeAccount(org.id);
    const statementId = await seedStatement(
      org.id,
      account.id,
      CORRUPTED_CSV,
      "corrupt.csv",
    );

    const result = await processStatement(statementId, org.id);

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.breaks).toBeGreaterThanOrEqual(1);
    expect(result.confidence).toBeLessThan(0.9);

    const statement = await prisma.statement.findUnique({
      where: { id: statementId },
    });
    expect(statement!.status).toBe("NEEDS_REVIEW");
  });
});
