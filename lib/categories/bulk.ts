import { prisma } from "@/lib/db/client";
import { ledgerWhere, parseLedgerFilters } from "@/lib/transactions/filters";
import type { LedgerQuery } from "@/lib/transactions/url";

/**
 * Assign `categoryId` (or null to clear) to every transaction matching the
 * ledger `query` filters, within the org, recording a CATEGORIZED audit event
 * per affected row. Factored out of the server action for testing.
 */
export async function applyBulkCategorize(
  organizationId: string,
  actorId: string | null,
  query: LedgerQuery,
  categoryId: string | null,
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
      data: { categoryId },
    }),
    prisma.transactionEvent.createMany({
      data: ids.map((transactionId) => ({
        organizationId,
        transactionId,
        actorId,
        kind: "CATEGORIZED" as const,
        payload: { categoryId, bulk: true },
      })),
    }),
  ]);

  return { count: ids.length };
}
