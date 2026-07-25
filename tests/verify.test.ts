import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { ledgerWhere, parseLedgerFilters } from "@/lib/transactions/filters";
import { fetchLedgerPage } from "@/lib/transactions/query";
import { applyBulkVerify } from "@/lib/verification/bulk";

import { createTestOrg, resetDb } from "./helpers/db";

let orgId: string;
let accountId: string;
let withEvidenceId: string;

beforeAll(async () => {
  await resetDb();
  const org = await createTestOrg(`verify-${crypto.randomUUID()}`);
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

  const a = await prisma.transaction.create({
    data: {
      organizationId: orgId,
      bankAccountId: accountId,
      date: new Date(Date.UTC(2026, 5, 1)),
      description: "Has receipt",
      amount: -1000n,
      direction: "DEBIT",
      currency: "USD",
      dedupeHash: `v1-${crypto.randomUUID()}`,
    },
  });
  withEvidenceId = a.id;
  await prisma.transaction.create({
    data: {
      organizationId: orgId,
      bankAccountId: accountId,
      date: new Date(Date.UTC(2026, 5, 2)),
      description: "No receipt",
      amount: -2000n,
      direction: "DEBIT",
      currency: "USD",
      dedupeHash: `v2-${crypto.randomUUID()}`,
    },
  });
  await prisma.attachment.create({
    data: {
      organizationId: orgId,
      transactionId: withEvidenceId,
      kind: "RECEIPT",
      fileKey: `orgs/${orgId}/evidence/x/receipt.pdf`,
      originalFilename: "receipt.pdf",
    },
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function run(query: Record<string, string>) {
  return fetchLedgerPage(orgId, {}, ledgerWhere(parseLedgerFilters(query)));
}

describe("evidence-completeness filter", () => {
  test("has evidence vs missing", async () => {
    const has = await run({ evidence: "yes" });
    expect(has.rows.map((r) => r.description)).toEqual(["Has receipt"]);
    const missing = await run({ evidence: "no" });
    expect(missing.rows.map((r) => r.description)).toEqual(["No receipt"]);
  });
});

describe("applyBulkVerify", () => {
  test("verifies matching transactions and records events", async () => {
    const { count } = await applyBulkVerify(orgId, null, {}, "VERIFIED");
    expect(count).toBe(2);

    const verified = await prisma.transaction.count({
      where: { organizationId: orgId, verificationStatus: "VERIFIED" },
    });
    expect(verified).toBe(2);

    const events = await prisma.transactionEvent.count({
      where: { organizationId: orgId, kind: "VERIFIED" },
    });
    expect(events).toBe(2);
  });

  test("can target a filtered subset", async () => {
    const { count } = await applyBulkVerify(
      orgId,
      null,
      { evidence: "no" },
      "DISPUTED",
    );
    expect(count).toBe(1);
    const disputed = await prisma.transaction.findFirst({
      where: { organizationId: orgId, verificationStatus: "DISPUTED" },
    });
    expect(disputed!.description).toBe("No receipt");
  });
});
