import { runControlsForStatement } from "@/lib/controls/run";
import { prisma } from "@/lib/db/client";
import { markTemplateTrustedForStatement } from "@/lib/extraction/templates";
import { reconcileStatement } from "@/lib/statements/reconcile";

/**
 * Confirm and re-parse operations for statement review, factored out of the
 * server actions so they can be integration-tested without an auth session.
 */

export type StatementActionResult = { ok?: true; error?: string };

/**
 * Confirm a statement, writing its transactions to the ledger. When the
 * statement fully reconciles, its saved template is marked trusted so future
 * matching uploads can auto-confirm.
 */
export async function confirmStatement(
  organizationId: string,
  statementId: string,
): Promise<StatementActionResult> {
  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
    include: { transactions: true },
  });
  if (!statement) return { error: "Statement not found." };
  if (statement.status === "CONFIRMED") {
    return { error: "This statement is already confirmed." };
  }
  if (statement.transactions.length === 0) {
    return { error: "There are no transactions to confirm." };
  }

  const recon = reconcileStatement(
    statement,
    statement.transactions,
    statement.confidence ?? 0.5,
  );

  await prisma.$transaction(async (tx) => {
    await tx.statement.update({
      where: { id: statementId },
      data: { status: "CONFIRMED" },
    });
    // Only vouch for the format when it actually reconciles.
    if (recon.ok) {
      await markTemplateTrustedForStatement(statementId, tx);
    }
  });

  // Refresh financial controls now that the statement is source-of-truth.
  try {
    await runControlsForStatement(organizationId, statementId);
  } catch (error) {
    console.error("[controls] failed on confirm", statementId, error);
  }

  return { ok: true };
}

/**
 * Reset a statement for re-parsing: discard its extracted transactions and
 * queue it again. The caller enqueues the job afterward. Confirmed statements
 * are protected.
 */
export async function prepareReparse(
  organizationId: string,
  statementId: string,
): Promise<StatementActionResult> {
  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
  });
  if (!statement) return { error: "Statement not found." };
  if (!statement.fileKey) return { error: "This statement has no file to re-parse." };
  if (statement.status === "CONFIRMED") {
    return { error: "Confirmed statements can't be re-parsed." };
  }

  await prisma.$transaction([
    prisma.transaction.deleteMany({ where: { statementId, organizationId } }),
    prisma.statement.update({
      where: { id: statementId },
      data: {
        status: "QUEUED",
        parserUsed: null,
        confidence: null,
        rawExtractionKey: null,
        statementTemplateId: null,
      },
    }),
    prisma.importJob.updateMany({
      where: { statementId },
      data: {
        status: "QUEUED",
        error: null,
        startedAt: null,
        finishedAt: null,
      },
    }),
  ]);

  return { ok: true };
}
