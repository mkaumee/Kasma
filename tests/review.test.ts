import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { applyStatementRowEdits } from "@/lib/statements/review";

import { createTestOrg, resetDb } from "./helpers/db";

async function seed() {
  const org = await createTestOrg(`review-${crypto.randomUUID()}`);
  const account = await prisma.bankAccount.create({
    data: {
      organizationId: org.id,
      bankName: "Chase",
      accountName: "Operating",
      currency: "USD",
      openingBalance: 100000n,
    },
  });
  const statement = await prisma.statement.create({
    data: {
      organizationId: org.id,
      bankAccountId: account.id,
      currency: "USD",
      status: "NEEDS_REVIEW",
      source: "UPLOAD",
      openingBalance: 100000n,
      closingBalance: 249550n,
    },
  });
  return { org, account, statement };
}

function row(
  date: string,
  description: string,
  amount: string,
  balance: string,
  id?: string,
) {
  return { id, date, description, amount, balance, reference: "" };
}

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("applyStatementRowEdits", () => {
  test("editing a row's amount fixes reconciliation and flips to PARSED", async () => {
    const { org, account, statement } = await seed();
    // Seed a broken row (balance implies -500 but amount is -50).
    const txn = await prisma.transaction.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        statementId: statement.id,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Rent",
        amount: -5000n,
        direction: "DEBIT",
        runningBalance: 249550n,
        currency: "USD",
        dedupeHash: `seed-${crypto.randomUUID()}`,
      },
    });

    // A single row of -1495.50 reconciles 1000.00 → 2495.50... but closing is
    // 2495.50 here, and one debit that lands exactly there:
    const res = await applyStatementRowEdits(org.id, null, {
      statementId: statement.id,
      rows: [row("2026-06-01", "Salary", "1495.50", "2495.50", txn.id)],
    });
    expect(res.ok).toBe(true);

    const updated = await prisma.transaction.findUnique({
      where: { id: txn.id },
    });
    expect(updated!.amount).toBe(149550n);
    expect(updated!.direction).toBe("CREDIT");

    const stmt = await prisma.statement.findUnique({
      where: { id: statement.id },
    });
    expect(stmt!.status).toBe("PARSED");

    // An EDITED audit event was recorded.
    const events = await prisma.transactionEvent.findMany({
      where: { transactionId: txn.id, kind: "EDITED" },
    });
    expect(events).toHaveLength(1);
  });

  test("adds new rows and deletes omitted ones", async () => {
    const { org, account, statement } = await seed();
    const keep = await prisma.transaction.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        statementId: statement.id,
        date: new Date(Date.UTC(2026, 5, 1)),
        description: "Keep me",
        amount: -5000n,
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `keep-${crypto.randomUUID()}`,
      },
    });
    const drop = await prisma.transaction.create({
      data: {
        organizationId: org.id,
        bankAccountId: account.id,
        statementId: statement.id,
        date: new Date(Date.UTC(2026, 5, 2)),
        description: "Drop me",
        amount: -1000n,
        direction: "DEBIT",
        currency: "USD",
        dedupeHash: `drop-${crypto.randomUUID()}`,
      },
    });

    const res = await applyStatementRowEdits(org.id, null, {
      statementId: statement.id,
      rows: [
        row("2026-06-01", "Keep me", "-50.00", "", keep.id),
        row("2026-06-03", "Brand new", "42.00", ""),
      ],
    });
    expect(res.ok).toBe(true);

    const remaining = await prisma.transaction.findMany({
      where: { statementId: statement.id },
      orderBy: { date: "asc" },
    });
    expect(remaining).toHaveLength(2);
    expect(remaining.map((t) => t.description)).toEqual(["Keep me", "Brand new"]);
    expect(await prisma.transaction.findUnique({ where: { id: drop.id } })).toBeNull();
  });

  test("rejects edits to a confirmed statement", async () => {
    const { org, statement } = await seed();
    await prisma.statement.update({
      where: { id: statement.id },
      data: { status: "CONFIRMED" },
    });
    const res = await applyStatementRowEdits(org.id, null, {
      statementId: statement.id,
      rows: [row("2026-06-01", "X", "1.00", "")],
    });
    expect(res.error).toMatch(/already confirmed/i);
  });

  test("rejects two identical rows", async () => {
    const { org, statement } = await seed();
    const res = await applyStatementRowEdits(org.id, null, {
      statementId: statement.id,
      rows: [
        row("2026-06-01", "Dup", "10.00", ""),
        row("2026-06-01", "Dup", "10.00", ""),
      ],
    });
    expect(res.error).toMatch(/identical/i);
  });

  test("a reviewer's balance correction is recorded as read, not derived", async () => {
    const { org, statement } = await seed();
    await prisma.statement.update({
      where: { id: statement.id },
      data: { openingBalanceInferred: true, closingBalanceInferred: true },
    });

    // Both differ from the seeded 1000.00 / 2495.50, i.e. a real correction.
    const res = await applyStatementRowEdits(org.id, null, {
      statementId: statement.id,
      rows: [row("2026-06-01", "X", "-4.50", "1495.50")],
      openingBalance: "1500.00",
      closingBalance: "1495.50",
    });
    expect(res.ok).toBe(true);

    const after = await prisma.statement.findUniqueOrThrow({
      where: { id: statement.id },
    });
    expect(after.openingBalance).toBe(150000n);
    expect(after.closingBalance).toBe(149550n);
    expect(after.openingBalanceInferred).toBe(false);
    expect(after.closingBalanceInferred).toBe(false);
    // Corrected balances now genuinely verify the row → off NEEDS_REVIEW.
    expect(after.status).toBe("PARSED");
  });

  test("saving without touching derived balances keeps them derived", async () => {
    // Regression: the editor always submits both fields, so an unchanged value
    // must not be promoted to "read" — that would turn a circular (and thus
    // unverifiable) balance pair into a false "reconciles" on the next save.
    const { org, statement } = await seed();
    await prisma.statement.update({
      where: { id: statement.id },
      data: {
        openingBalance: 100000n,
        closingBalance: 249550n,
        openingBalanceInferred: true,
        closingBalanceInferred: true,
      },
    });

    const res = await applyStatementRowEdits(org.id, null, {
      statementId: statement.id,
      rows: [row("2026-06-01", "X", "-4.50", "995.50")],
      // Resubmitted unchanged, exactly as the editor sends them.
      openingBalance: "1000.00",
      closingBalance: "2495.50",
    });
    expect(res.ok).toBe(true);

    const after = await prisma.statement.findUniqueOrThrow({
      where: { id: statement.id },
    });
    expect(after.openingBalanceInferred).toBe(true);
    expect(after.closingBalanceInferred).toBe(true);
  });
});
