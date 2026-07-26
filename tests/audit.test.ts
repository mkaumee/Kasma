import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { fetchAuditPage } from "@/lib/audit/query";
import { prisma } from "@/lib/db/client";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`audit-${crypto.randomUUID()}`);
  orgId = org.id;
  const account = await prisma.bankAccount.create({
    data: {
      organizationId: orgId,
      bankName: "Chase",
      accountName: "Operating",
      currency: "USD",
    },
  });
  const txn = await prisma.transaction.create({
    data: {
      organizationId: orgId,
      bankAccountId: account.id,
      date: new Date(Date.UTC(2026, 5, 1)),
      description: "Coffee",
      amount: -450n,
      direction: "DEBIT",
      currency: "USD",
      dedupeHash: `au-${crypto.randomUUID()}`,
    },
  });
  for (let i = 0; i < 3; i++) {
    await prisma.transactionEvent.create({
      data: {
        organizationId: orgId,
        transactionId: txn.id,
        kind: i === 0 ? "CREATED" : "EDITED",
        payload: { i },
      },
    });
  }

  // Another org's event must not leak in.
  const other = await createTestOrg(`audit-other-${crypto.randomUUID()}`);
  const oa = await prisma.bankAccount.create({
    data: {
      organizationId: other.id,
      bankName: "X",
      accountName: "Y",
      currency: "USD",
    },
  });
  const ot = await prisma.transaction.create({
    data: {
      organizationId: other.id,
      bankAccountId: oa.id,
      date: new Date(Date.UTC(2026, 5, 1)),
      description: "Other",
      amount: -1n,
      direction: "DEBIT",
      currency: "USD",
      dedupeHash: `au2-${crypto.randomUUID()}`,
    },
  });
  await prisma.transactionEvent.create({
    data: { organizationId: other.id, transactionId: ot.id, kind: "CREATED" },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("fetchAuditPage", () => {
  test("returns org-scoped events, newest first, paginated", async () => {
    const p1 = await fetchAuditPage(orgId, 1, 2);
    expect(p1.total).toBe(3);
    expect(p1.pageCount).toBe(2);
    expect(p1.rows).toHaveLength(2);
    // newest first: createdAt descending
    expect(p1.rows[0]!.createdAt.getTime()).toBeGreaterThanOrEqual(
      p1.rows[1]!.createdAt.getTime(),
    );

    const p2 = await fetchAuditPage(orgId, 2, 2);
    expect(p2.rows).toHaveLength(1);
  });
});
