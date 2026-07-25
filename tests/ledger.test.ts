import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { fetchLedgerPage } from "@/lib/transactions/query";

import { createTestOrg, resetDb } from "./helpers/db";

async function makeAccount(organizationId: string) {
  return prisma.bankAccount.create({
    data: {
      organizationId,
      bankName: "Chase",
      accountName: "Operating",
      currency: "USD",
    },
  });
}

async function makeTxn(
  organizationId: string,
  bankAccountId: string,
  day: number,
  amount: bigint,
  description: string,
) {
  return prisma.transaction.create({
    data: {
      organizationId,
      bankAccountId,
      date: new Date(Date.UTC(2026, 5, day)),
      description,
      amount,
      direction: amount < 0n ? "DEBIT" : "CREDIT",
      currency: "USD",
      dedupeHash: `h-${crypto.randomUUID()}`,
    },
  });
}

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("fetchLedgerPage", () => {
  test("paginates and reports totals", async () => {
    const org = await createTestOrg(`ledger-${crypto.randomUUID()}`);
    const account = await makeAccount(org.id);
    for (let i = 1; i <= 5; i++) {
      await makeTxn(org.id, account.id, i, BigInt(i * 100), `Txn ${i}`);
    }

    const p1 = await fetchLedgerPage(org.id, { page: 1, pageSize: 2 });
    expect(p1.total).toBe(5);
    expect(p1.pageCount).toBe(3);
    expect(p1.rows).toHaveLength(2);

    const p3 = await fetchLedgerPage(org.id, { page: 3, pageSize: 2 });
    expect(p3.rows).toHaveLength(1);
  });

  test("sorts by date and amount", async () => {
    const org = await createTestOrg(`ledger-sort-${crypto.randomUUID()}`);
    const account = await makeAccount(org.id);
    await makeTxn(org.id, account.id, 1, 300n, "A");
    await makeTxn(org.id, account.id, 2, 100n, "B");
    await makeTxn(org.id, account.id, 3, 200n, "C");

    const byDateDesc = await fetchLedgerPage(org.id, { sort: "date", dir: "desc" });
    expect(byDateDesc.rows.map((r) => r.description)).toEqual(["C", "B", "A"]);

    const byAmountAsc = await fetchLedgerPage(org.id, {
      sort: "amount",
      dir: "asc",
    });
    expect(byAmountAsc.rows.map((r) => r.description)).toEqual(["B", "C", "A"]);
  });

  test("is scoped to the organization", async () => {
    const orgA = await createTestOrg(`ledger-a-${crypto.randomUUID()}`);
    const orgB = await createTestOrg(`ledger-b-${crypto.randomUUID()}`);
    const accA = await makeAccount(orgA.id);
    const accB = await makeAccount(orgB.id);
    await makeTxn(orgA.id, accA.id, 1, 100n, "A-only");
    await makeTxn(orgB.id, accB.id, 1, 100n, "B-only");

    const a = await fetchLedgerPage(orgA.id, {});
    expect(a.total).toBe(1);
    expect(a.rows[0]!.description).toBe("A-only");
  });
});
