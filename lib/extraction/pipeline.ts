import { Prisma, StatementStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { dedupeHash, flagDuplicates } from "@/lib/extraction/dedupe";
import { normalizeStatement } from "@/lib/extraction/normalize";
import { parseStatement } from "@/lib/extraction/parsers";
import {
  computeSignature,
  findTemplate,
  recordTemplate,
} from "@/lib/extraction/templates";
import { validateStatement, type ValidationResult } from "@/lib/extraction/validate";
import { runControlsForStatement } from "@/lib/controls/run";
import { applyCategorizationRules } from "@/lib/rules/engine";
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
/** Confidence required to auto-confirm (only with a trusted template). */
const AUTO_CONFIRM_CONFIDENCE = 0.98;

export type StatusInputs = {
  validation: ValidationResult;
  /** Rows the normalizer could not use. */
  dropped: number;
  /** Whether a trusted saved template matched this format. */
  trustedTemplate: boolean;
};

/**
 * Route a validated statement to a status:
 *  - CONFIRMED (auto): a trusted template matched, it fully reconciled, no rows
 *    were dropped, and confidence is at the reconciled bar.
 *  - PARSED: reconciled and high-confidence, awaiting a light review.
 *  - NEEDS_REVIEW: anything else.
 */
export function decideStatus(inputs: StatusInputs): StatementStatus {
  const { validation, dropped, trustedTemplate } = inputs;
  if (
    trustedTemplate &&
    validation.ok &&
    dropped === 0 &&
    validation.confidence >= AUTO_CONFIRM_CONFIDENCE
  ) {
    return StatementStatus.CONFIRMED;
  }
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

    // Saved-template match: reuse a known format and gate auto-confirm on a
    // human having previously trusted it.
    const signature = computeSignature(parseResult);
    const rawColumns = parseResult.meta?.columns;
    const columnMap: Prisma.InputJsonValue | null =
      rawColumns && typeof rawColumns === "object" && !Array.isArray(rawColumns)
        ? (rawColumns as Prisma.InputJsonValue)
        : null;
    const trustedTemplate = signature
      ? ((await findTemplate(organizationId, signature))?.trusted ?? false)
      : false;

    const status = decideStatus({
      validation,
      dropped: normalized.dropped,
      trustedTemplate,
    });

    await prisma.$transaction(
      async (tx) => {
        const statementTemplateId = signature
          ? await recordTemplate(
              {
                organizationId,
                bankAccountId: statement.bankAccountId,
                signature,
                parserUsed: parseResult.parser,
                columnMap,
              },
              tx,
            )
          : null;

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
            statementTemplateId,
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

    // Auto-categorize the freshly imported rows via the org's rules.
    if (toInsert.length > 0) {
      await applyCategorizationRules(organizationId, {
        statementId,
        onlyUncategorized: true,
      });
    }

    // Run financial controls; never fail the import if a detector errors.
    try {
      await runControlsForStatement(organizationId, statementId);
    } catch (error) {
      console.error("[controls] failed for statement", statementId, error);
    }

    // Notify reviewers in-app (best-effort).
    try {
      const { notifyOrg } = await import("@/lib/notifications/service");
      await notifyOrg(
        organizationId,
        {
          type: "STATEMENT_PARSED",
          title: `Statement ${status.toLowerCase().replace("_", " ")}`,
          body: `${statement.originalFilename ?? "Statement"} — ${
            toInsert.length
          } transaction${toInsert.length === 1 ? "" : "s"} imported.`,
          href: `/statements/${statementId}`,
        },
        { minRole: "ACCOUNTANT" },
      );
    } catch (error) {
      console.error("[notify] failed for statement", statementId, error);
    }

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

    try {
      const { notifyOrg } = await import("@/lib/notifications/service");
      await notifyOrg(
        organizationId,
        {
          type: "STATEMENT_FAILED",
          title: "Statement failed to parse",
          body: message.slice(0, 200),
          href: `/statements/${statementId}`,
        },
        { minRole: "ACCOUNTANT" },
      );
    } catch {
      /* best-effort */
    }
    throw error;
  }
}
