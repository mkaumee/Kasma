import { StatementStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { dedupeHash, flagDuplicates } from "@/lib/extraction/dedupe";
import { normalizeStatement } from "@/lib/extraction/normalize";
import { parseStatement } from "@/lib/extraction/parsers";
import { validateStatement, type ValidationResult } from "@/lib/extraction/validate";
import { getStorage } from "@/lib/storage";
import { statementRawExtractionKey } from "@/lib/storage/keys";

/**
 * Statement-processing pipeline — the worker's job body. Ties together the
 * parser registry (deterministic + Claude fallback), the normalizer, the
 * running-balance validator, and dedupe, then persists the result
 * transactionally with an immutable audit event per transaction and the
 * statement's status transition.
 */

export type ProcessResult = {
  statementId: string;
  status: StatementStatus;
  parser: string;
  confidence: number;
  inserted: number;
  duplicates: number;
  dropped: number;
  breaks: number;
};

/** Confidence at/above which a validated statement is considered clean. */
const PARSED_CONFIDENCE = 0.9;

/**
 * Route a validated statement to a status. Auto-confirm (→ CONFIRMED) is added
 * in 6.12; here a clean, high-confidence parse is PARSED and everything else
 * needs a human review.
 */
export function decideStatus(validation: ValidationResult): StatementStatus {
  if (validation.ok && validation.confidence >= PARSED_CONFIDENCE) {
    return StatementStatus.PARSED;
  }
  return StatementStatus.NEEDS_REVIEW;
}

export async function processStatement(
  statementId: string,
  organizationId: string,
): Promise<ProcessResult> {
  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
    include: { bankAccount: true },
  });
  if (!statement) {
    throw new Error(`Statement ${statementId} not found for org ${organizationId}`);
  }
  if (!statement.fileKey) {
    throw new Error(`Statement ${statementId} has no file to parse`);
  }

  // Mark in-progress (statement + its import job).
  await prisma.$transaction([
    prisma.statement.update({
      where: { id: statementId },
      data: { status: StatementStatus.PARSING },
    }),
    prisma.importJob.updateMany({
      where: { statementId },
      data: {
        status: "RUNNING",
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    }),
  ]);

  try {
    const bytes = await getStorage().get(statement.fileKey);
    const parseResult = await parseStatement({
      bytes,
      filename: statement.originalFilename ?? "statement",
      hintCurrency: statement.bankAccount.currency,
    });

    const normalized = normalizeStatement(parseResult.raw, {
      fallbackCurrency: statement.bankAccount.currency,
    });
    const validation = validateStatement(normalized, {
      parserConfidence: parseResult.confidence,
    });

    // Persist the raw extractor response for the audit trail, when present.
    let rawExtractionKey: string | null = null;
    const rawResponse = parseResult.meta?.rawResponse;
    if (typeof rawResponse === "string") {
      rawExtractionKey = statementRawExtractionKey(organizationId, statementId);
      await getStorage().put(
        rawExtractionKey,
        Buffer.from(rawResponse, "utf-8"),
        { contentType: "application/json" },
      );
    }

    // Dedupe against the batch and everything already stored for the org.
    const hashes = normalized.transactions.map((t) =>
      dedupeHash({
        bankAccountId: statement.bankAccountId,
        date: t.date,
        amount: t.amount,
        description: t.rawDescription || t.description,
        reference: t.reference,
      }),
    );
    const existingRows = hashes.length
      ? await prisma.transaction.findMany({
          where: { organizationId, dedupeHash: { in: hashes } },
          select: { dedupeHash: true },
        })
      : [];
    const existing = new Set(existingRows.map((r) => r.dedupeHash));
    const flags = flagDuplicates(hashes, existing);

    const toInsert = normalized.transactions
      .map((t, i) => ({ t, hash: hashes[i]!, isDuplicate: flags[i]!.isDuplicate }))
      .filter((x) => !x.isDuplicate);

    const status = decideStatus(validation);

    await prisma.$transaction(
      async (tx) => {
        await tx.statement.update({
          where: { id: statementId },
          data: {
            status,
            currency: normalized.currency,
            openingBalance: normalized.openingBalance,
            closingBalance: normalized.closingBalance,
            parserUsed: parseResult.parser,
            confidence: validation.confidence,
            rawExtractionKey,
            // Prefer a period the uploader set; fall back to what we extracted.
            periodStart: statement.periodStart ?? normalized.periodStart,
            periodEnd: statement.periodEnd ?? normalized.periodEnd,
          },
        });

        if (toInsert.length > 0) {
          await tx.transaction.createMany({
            data: toInsert.map(({ t, hash }) => ({
              organizationId,
              bankAccountId: statement.bankAccountId,
              statementId,
              date: t.date,
              valueDate: t.valueDate,
              description: t.description,
              rawDescription: t.rawDescription || null,
              amount: t.amount,
              direction: t.direction,
              type: t.type,
              runningBalance: t.balance,
              currency: t.currency,
              counterparty: t.counterparty,
              reference: t.reference,
              dedupeHash: hash,
            })),
            skipDuplicates: true,
          });

          // Fetch the rows we just inserted (unique per org by dedupeHash) to
          // attach an immutable CREATED event to each.
          const inserted = await tx.transaction.findMany({
            where: {
              organizationId,
              dedupeHash: { in: toInsert.map((x) => x.hash) },
            },
            select: { id: true },
          });
          if (inserted.length > 0) {
            await tx.transactionEvent.createMany({
              data: inserted.map((row) => ({
                organizationId,
                transactionId: row.id,
                kind: "CREATED" as const,
                payload: {
                  source: "statement-import",
                  statementId,
                  parser: parseResult.parser,
                },
              })),
            });
          }
        }

        await tx.importJob.updateMany({
          where: { statementId },
          data: { status: "SUCCEEDED", finishedAt: new Date(), error: null },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    return {
      statementId,
      status,
      parser: parseResult.parser,
      confidence: validation.confidence,
      inserted: toInsert.length,
      duplicates: flags.filter((f) => f.isDuplicate).length,
      dropped: normalized.dropped,
      breaks: validation.breaks.length,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Best-effort failure recording; never mask the original error.
    await prisma
      .$transaction([
        prisma.statement.update({
          where: { id: statementId },
          data: { status: StatementStatus.FAILED },
        }),
        prisma.importJob.updateMany({
          where: { statementId },
          data: {
            status: "FAILED",
            finishedAt: new Date(),
            error: message.slice(0, 1000),
          },
        }),
      ])
      .catch(() => {});
    throw error;
  }
}
