import type { VerificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { ledgerWhere, parseLedgerFilters } from "@/lib/transactions/filters";
import type { LedgerQuery } from "@/lib/transactions/url";

/**
 * Set the verification status of every transaction matching the ledger `query`
 * filters, within the org, recording a VERIFIED audit event per row. Mirrors
 * the bulk-categorize flow; factored out of the action for testing.
 */
export async function applyBulkVerify(
  organizationId: string,
  actorId: string | null,
  query: LedgerQuery,
  status: VerificationStatus,
): Promise<{ count: number }> {
  const where = {
    ...ledgerWhere(parseLedgerFilters(query)),
    organizationId,
  };
  const targets = await prisma.transaction.findMany({
    where,
    select: { id: true },
  });
  if (targets.length === 0) return { count: 0 };

  const ids = targets.map((t) => t.id);
  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { verificationStatus: status },
    }),
    prisma.transactionEvent.createMany({
      data: ids.map((transactionId) => ({
        organizationId,
        transactionId,
        actorId,
        kind: "VERIFIED" as const,
        payload: { status, bulk: true },
      })),
    }),
  ]);

  return { count: ids.length };
}
