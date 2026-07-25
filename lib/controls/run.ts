import { detectAnomalies } from "@/lib/controls/anomaly";
import {
  detectMissingStatements,
  detectMissingTransactions,
} from "@/lib/controls/missing";
import { reconcileStatementRecord } from "@/lib/controls/reconcile";
import { matchInternalTransfers } from "@/lib/controls/transfers";
import { prisma } from "@/lib/db/client";

/**
 * Financial-control orchestrator (Feature 5). Runs every detector for a
 * statement (and the org-wide passes it touches), keeping alerts current.
 * Called after import and on confirm.
 */
export async function runControlsForStatement(
  organizationId: string,
  statementId: string,
): Promise<void> {
  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
    select: { bankAccountId: true },
  });
  if (!statement) return;

  await reconcileStatementRecord(organizationId, statementId);
  await detectMissingTransactions(organizationId, statementId);
  await detectMissingStatements(organizationId, statement.bankAccountId);
  await matchInternalTransfers(organizationId);
  await detectAnomalies(organizationId);
}

/** Full org sweep — every statement plus the org-wide detectors. */
export async function runControlsForOrg(organizationId: string): Promise<void> {
  const statements = await prisma.statement.findMany({
    where: {
      organizationId,
      status: { in: ["PARSED", "NEEDS_REVIEW", "CONFIRMED"] },
    },
    select: { id: true, bankAccountId: true },
  });

  const accountIds = new Set<string>();
  for (const s of statements) {
    await reconcileStatementRecord(organizationId, s.id);
    await detectMissingTransactions(organizationId, s.id);
    accountIds.add(s.bankAccountId);
  }
  for (const accountId of accountIds) {
    await detectMissingStatements(organizationId, accountId);
  }
  await matchInternalTransfers(organizationId);
  await detectAnomalies(organizationId);
}
