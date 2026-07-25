import { Prisma, TxnDirection, type TxnType } from "@prisma/client";
import { z } from "zod";

import { prisma } from "@/lib/db/client";
import { dedupeHash } from "@/lib/extraction/dedupe";
import { inferType } from "@/lib/extraction/normalize";
import { validateBalances } from "@/lib/extraction/validate";
import { parseMoney } from "@/lib/money/currency";

/**
 * Core persistence for statement-review edits, factored out of the server
 * action so it can be integration-tested without an auth session. Diffs the
 * submitted rows against the persisted ones (update / add / delete), records an
 * immutable audit event per change, re-validates against the running balance,
 * and re-routes the statement's status.
 */

export const reviewRowSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1), // yyyy-mm-dd
  description: z.string().max(500).optional().default(""),
  amount: z.string().min(1), // signed decimal
  balance: z.string().optional().default(""),
  reference: z.string().max(200).optional().default(""),
});

export const reviewSchema = z.object({
  statementId: z.string().min(1),
  rows: z.array(reviewRowSchema).max(5000),
});

export type ReviewInput = z.input<typeof reviewSchema>;
export type ReviewResult = { error?: string; ok?: boolean };

type Prepared = {
  id?: string;
  date: Date;
  description: string;
  amount: bigint;
  direction: TxnDirection;
  type: TxnType;
  balance: bigint | null;
  reference: string | null;
  hash: string;
};

export async function applyStatementRowEdits(
  organizationId: string,
  actorId: string | null,
  input: ReviewInput,
): Promise<ReviewResult> {
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid data." };
  const { statementId, rows } = parsed.data;

  const statement = await prisma.statement.findFirst({
    where: { id: statementId, organizationId },
    include: { bankAccount: true, transactions: { select: { id: true } } },
  });
  if (!statement) return { error: "Statement not found." };
  if (statement.status === "CONFIRMED") {
    return { error: "This statement is already confirmed." };
  }

  const currency = statement.currency ?? statement.bankAccount.currency;

  const prepared: Prepared[] = [];
  for (const r of rows) {
    const date = new Date(`${r.date}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) return { error: `Invalid date: ${r.date}` };
    const amount = parseMoney(r.amount, currency);
    if (amount == null) return { error: `Invalid amount: “${r.amount}”` };
    const hasBalance = r.balance.trim() !== "";
    const balance = hasBalance ? parseMoney(r.balance, currency) : null;
    if (hasBalance && balance == null) {
      return { error: `Invalid balance: “${r.balance}”` };
    }
    const description = r.description.trim() || "(no description)";
    const direction = amount < 0n ? TxnDirection.DEBIT : TxnDirection.CREDIT;
    const reference = r.reference.trim() || null;
    prepared.push({
      id: r.id,
      date,
      description,
      amount,
      direction,
      type: inferType(description, direction),
      balance,
      reference,
      hash: dedupeHash({
        bankAccountId: statement.bankAccountId,
        date,
        amount,
        description,
        reference,
      }),
    });
  }

  const seen = new Set<string>();
  for (const p of prepared) {
    if (seen.has(p.hash)) {
      return {
        error:
          "Two rows are identical (same date, amount, and description). Adjust one before saving.",
      };
    }
    seen.add(p.hash);
  }

  const existingIds = new Set(statement.transactions.map((t) => t.id));
  const submittedIds = new Set(prepared.filter((p) => p.id).map((p) => p.id!));
  const toDelete = [...existingIds].filter((id) => !submittedIds.has(id));

  const recon = validateBalances(
    {
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      rows: prepared.map((p) => ({ amount: p.amount, balance: p.balance })),
    },
    { parserConfidence: statement.confidence ?? 0.5 },
  );
  // Manual edits never auto-confirm.
  const status = recon.ok && recon.confidence >= 0.9 ? "PARSED" : "NEEDS_REVIEW";

  try {
    await prisma.$transaction(
      async (tx) => {
        if (toDelete.length > 0) {
          await tx.transaction.deleteMany({
            where: { id: { in: toDelete }, organizationId },
          });
        }
        for (const p of prepared) {
          if (p.id && existingIds.has(p.id)) {
            await tx.transaction.update({
              where: { id: p.id },
              data: {
                date: p.date,
                description: p.description,
                amount: p.amount,
                direction: p.direction,
                type: p.type,
                runningBalance: p.balance,
                reference: p.reference,
                dedupeHash: p.hash,
              },
            });
            await tx.transactionEvent.create({
              data: {
                organizationId,
                transactionId: p.id,
                actorId,
                kind: "EDITED",
                payload: { source: "review-edit" },
              },
            });
          } else {
            const created = await tx.transaction.create({
              data: {
                organizationId,
                bankAccountId: statement.bankAccountId,
                statementId,
                date: p.date,
                description: p.description,
                amount: p.amount,
                direction: p.direction,
                type: p.type,
                runningBalance: p.balance,
                currency,
                reference: p.reference,
                dedupeHash: p.hash,
              },
            });
            await tx.transactionEvent.create({
              data: {
                organizationId,
                transactionId: created.id,
                actorId,
                kind: "CREATED",
                payload: { source: "review-add" },
              },
            });
          }
        }
        await tx.statement.update({
          where: { id: statementId },
          data: { status, confidence: recon.confidence },
        });
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "A transaction with the same details already exists." };
    }
    throw error;
  }

  return { ok: true };
}
