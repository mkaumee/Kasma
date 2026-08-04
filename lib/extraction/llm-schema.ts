import { z } from "zod";

import type { RawStatement, RawTransactionRow } from "@/lib/extraction/types";

/**
 * Shared LLM-extraction contract used by every LLM provider (Claude, DeepSeek).
 * Keeping the schema, prompt, redaction, and JSON→canonical mapping in one
 * place means the providers differ only in transport. The guardrails — strict
 * JSON shape, PII redaction, never trusting the model's math — stay identical.
 */

/** Cap on text sent to a model, to bound token cost on huge exports. */
export const MAX_TEXT_CHARS = 200_000;

/** Base confidence for a successful LLM extraction, before validation. */
export const LLM_BASE_CONFIDENCE = 0.7;

export const TransactionSchema = z.object({
  date: z.string().nullable(),
  valueDate: z.string().nullable(),
  description: z.string().nullable(),
  /** Signed decimal string (negative = debit), when a single amount column. */
  amount: z.string().nullable(),
  /** Separate debit/credit magnitudes, when the statement splits them. */
  debit: z.string().nullable(),
  credit: z.string().nullable(),
  /** Running balance after this row, as printed on the statement. */
  balance: z.string().nullable(),
  reference: z.string().nullable(),
  counterparty: z.string().nullable(),
});

export const StatementSchema = z.object({
  bankName: z.string().nullable(),
  accountLast4: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  openingBalance: z.string().nullable(),
  closingBalance: z.string().nullable(),
  currency: z.string().nullable(),
  transactions: z.array(TransactionSchema),
});

export type LlmStatement = z.infer<typeof StatementSchema>;

export const SYSTEM_PROMPT = [
  "You are a meticulous bank-statement data-extraction engine.",
  "Extract every transaction row from the provided bank statement exactly as printed.",
  "Rules:",
  "- Preserve amounts as decimal strings exactly as shown (keep the sign; use a leading '-' for debits/withdrawals). Do NOT round, reformat, or invent digits.",
  "- If a statement uses separate debit and credit columns, fill `debit` and `credit` and leave `amount` null.",
  "- If it uses one signed amount column, fill `amount` and leave `debit`/`credit` null.",
  "- Copy the printed running `balance` for each row when present; otherwise null.",
  "- Use ISO-8601 (YYYY-MM-DD) for dates when the format is unambiguous; otherwise copy the printed date string.",
  "- Never fabricate rows, balances, or totals. If a value is not present, use null.",
  "- Return ALL rows, in the order they appear.",
].join("\n");

/**
 * Mask sequences that look like full account/card numbers, keeping only the
 * last 4 digits. The 12-digit threshold targets card numbers (13–19),
 * IBAN-length and long account numbers while deliberately leaving dates
 * (≤8 digits) and money amounts untouched.
 */
export function redactAccountNumbers(text: string): string {
  return text.replace(/\b\d[\d -]{10,}\d\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 12) return match;
    return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
  });
}

/** Map a validated LLM statement to the pipeline's canonical raw shape. */
export function toRawStatement(
  parsed: LlmStatement,
  hintCurrency?: string,
): RawStatement {
  const transactions: RawTransactionRow[] = parsed.transactions.map((t) => ({
    date: t.date,
    valueDate: t.valueDate,
    description: t.description,
    amount: t.amount,
    debit: t.debit,
    credit: t.credit,
    balance: t.balance,
    reference: t.reference,
    counterparty: t.counterparty,
  }));

  return {
    bankName: parsed.bankName,
    accountLast4: parsed.accountLast4,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    currency: parsed.currency ?? hintCurrency ?? null,
    transactions,
  };
}
