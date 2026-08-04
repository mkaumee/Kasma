import {
  autoResolveAlert,
  severityForAmount,
  upsertAlert,
} from "@/lib/controls/alerts";
import { prisma } from "@/lib/db/client";
import { reconcileStatement } from "@/lib/statements/reconcile";

/**
 * Missing-transaction and missing-statement detection. Both lean on the
 * running balance: a break in a statement's continuity implies a missing row,
 * and a jump between one statement's closing and the next's opening implies a
 * whole statement is missing.
 */

const abs = (v: bigint) => (v < 0n ? -v : v);

/** Intra-statement: raise MISSING_TRANSACTION for running-balance gaps. */
export async function detectMissingTransactions(
  organizationId: string,
  statementId: string,
): Promise<{ gaps: number }> {
  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
    include: { transactions: true },
  });
  if (!statement) return { gaps: 0 };

  const currency = statement.currency ?? "USD";
  const v = reconcileStatement(
    statement,
    statement.transactions,
    statement.confidence ?? 0.5,
  );
  const key = `missingtx:${statementId}`;

  if (v.breaks.length > 0) {
    const totalGap = v.breaks.reduce((sum, b) => sum + abs(b.gap), 0n);
    await upsertAlert({
      organizationId,
      type: "MISSING_TRANSACTION",
      severity: severityForAmount(totalGap),
      title: `${v.breaks.length} unexplained balance gap${
        v.breaks.length === 1 ? "" : "s"
      } — a transaction may be missing`,
      detail: {
        breaks: v.breaks.map((b) => ({
          index: b.index,
          gap: b.gap.toString(),
        })),
        currency,
      },
      dedupeKey: key,
      bankAccountId: statement.bankAccountId,
      statementId,
    });
  } else {
    await autoResolveAlert(organizationId, key);
  }

  return { gaps: v.breaks.length };
}

/** Inter-statement: raise MISSING_STATEMENT when balances don't carry over. */
export async function detectMissingStatements(
  organizationId: string,
  bankAccountId: string,
): Promise<{ gaps: number }> {
  const statements = await prisma.statement.findMany({
    where: {
      organizationId,
      bankAccountId,
      openingBalance: { not: null },
      closingBalance: { not: null },
      status: { in: ["PARSED", "NEEDS_REVIEW", "CONFIRMED"] },
    },
    orderBy: [{ periodStart: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      currency: true,
      openingBalance: true,
      closingBalance: true,
    },
  });

  const activeKeys = new Set<string>();
  let gaps = 0;

  for (let i = 1; i < statements.length; i++) {
    const prev = statements[i - 1]!;
    const next = statements[i]!;
    if (prev.closingBalance == null || next.openingBalance == null) continue;
    if (prev.closingBalance === next.openingBalance) continue;

    gaps += 1;
    const key = `missingstmt:${next.id}`;
    activeKeys.add(key);
    const delta = next.openingBalance - prev.closingBalance;
    await upsertAlert({
      organizationId,
      type: "MISSING_STATEMENT",
      severity: severityForAmount(delta),
      title: "Possible missing statement — balances don't carry over",
      detail: {
        prevClosing: prev.closingBalance.toString(),
        nextOpening: next.openingBalance.toString(),
        delta: delta.toString(),
        currency: next.currency ?? "USD",
      },
      dedupeKey: key,
      bankAccountId,
      statementId: next.id,
    });
  }

  // Clear stale missing-statement alerts for this account (gap since filled).
  await prisma.alert.updateMany({
    where: {
      organizationId,
      bankAccountId,
      type: "MISSING_STATEMENT",
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
      dedupeKey: { notIn: activeKeys.size > 0 ? [...activeKeys] : ["__none__"] },
    },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  return { gaps };
}
