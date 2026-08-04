import type { ReconciliationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { reconcileStatement } from "@/lib/statements/reconcile";
import {
  autoResolveAlert,
  severityForAmount,
  upsertAlert,
} from "@/lib/controls/alerts";
import { formatMoney } from "@/lib/money/currency";

/**
 * Per-statement balance reconciliation. Recomputes the running balance,
 * persists a Reconciliation record, and raises or clears a BALANCE_MISMATCH
 * alert. Row-level gaps (MISSING_TRANSACTION) and cross-statement gaps live in
 * `lib/controls/missing.ts`.
 */

export type ReconcileResult = {
  status: ReconciliationStatus;
  delta: bigint | null;
  computedClosing: bigint | null;
  breaks: number;
};

const balanceKey = (statementId: string) => `balance:${statementId}`;

export async function reconcileStatementRecord(
  organizationId: string,
  statementId: string,
): Promise<ReconcileResult> {
  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
    include: { transactions: true },
  });
  if (!statement) throw new Error(`Statement ${statementId} not found`);

  const currency = statement.currency ?? "USD";
  const v = reconcileStatement(
    statement,
    statement.transactions,
    statement.confidence ?? 0.5,
  );

  const status: ReconciliationStatus =
    v.closingOk === true ? "BALANCED" : v.closingOk === false ? "MISMATCH" : "INCOMPLETE";

  await prisma.reconciliation.upsert({
    where: { statementId },
    create: {
      organizationId,
      statementId,
      expectedClosing: statement.closingBalance,
      computedClosing: v.computedClosing,
      delta: v.closingDelta,
      status,
      unmatchedCount: v.breaks.length,
    },
    update: {
      expectedClosing: statement.closingBalance,
      computedClosing: v.computedClosing,
      delta: v.closingDelta,
      status,
      unmatchedCount: v.breaks.length,
    },
  });

  const key = balanceKey(statementId);
  if (status === "MISMATCH" && v.closingDelta != null) {
    await upsertAlert({
      organizationId,
      type: "BALANCE_MISMATCH",
      severity: severityForAmount(v.closingDelta),
      title: `Statement doesn't reconcile — off by ${formatMoney(
        v.closingDelta < 0n ? -v.closingDelta : v.closingDelta,
        currency,
      )}`,
      detail: {
        expectedClosing: statement.closingBalance?.toString() ?? null,
        computedClosing: v.computedClosing?.toString() ?? null,
        delta: v.closingDelta.toString(),
        currency,
      },
      dedupeKey: key,
      bankAccountId: statement.bankAccountId,
      statementId,
    });
  } else {
    // Balanced or unverifiable → clear any prior mismatch alert.
    await autoResolveAlert(organizationId, key);
  }

  return {
    status,
    delta: v.closingDelta,
    computedClosing: v.computedClosing,
    breaks: v.breaks.length,
  };
}
