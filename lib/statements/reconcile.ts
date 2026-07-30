import type { Statement, Transaction } from "@prisma/client";

import type {
  NormalizedStatement,
  NormalizedTransaction,
} from "@/lib/extraction/normalize";
import { validateStatement, type ValidationResult } from "@/lib/extraction/validate";

/**
 * Recompute a statement's running-balance reconciliation from its persisted
 * transactions. Lets the review UI show a live reconciliation banner and lets
 * edits (Phase 7.3) re-validate without re-parsing the file. Shares the same
 * validation engine used at ingestion (Phase 6.9).
 */

export type ReconcileStatement = Pick<
  Statement,
  | "currency"
  | "openingBalance"
  | "closingBalance"
  | "openingBalanceInferred"
  | "closingBalanceInferred"
  | "periodStart"
  | "periodEnd"
>;

export type ReconcileTransaction = Pick<
  Transaction,
  | "date"
  | "valueDate"
  | "description"
  | "rawDescription"
  | "amount"
  | "direction"
  | "type"
  | "runningBalance"
  | "currency"
  | "counterparty"
  | "reference"
>;

export function toNormalizedStatement(
  statement: ReconcileStatement,
  transactions: ReconcileTransaction[],
): NormalizedStatement {
  const currency = statement.currency ?? "USD";
  return {
    currency,
    bankName: null,
    accountLast4: null,
    periodStart: statement.periodStart,
    periodEnd: statement.periodEnd,
    openingBalance: statement.openingBalance,
    closingBalance: statement.closingBalance,
    // Carried through so a re-reconciliation can't treat row-derived balances
    // as independent evidence (the circularity guard in validate.ts).
    openingBalanceInferred: statement.openingBalanceInferred,
    closingBalanceInferred: statement.closingBalanceInferred,
    transactions: transactions.map(
      (t): NormalizedTransaction => ({
        date: t.date,
        valueDate: t.valueDate,
        description: t.description,
        rawDescription: t.rawDescription ?? t.description,
        amount: t.amount,
        direction: t.direction,
        type: t.type,
        balance: t.runningBalance,
        currency: t.currency,
        counterparty: t.counterparty,
        reference: t.reference,
      }),
    ),
    // Rebuilt from already-persisted rows, so nothing was dropped here.
    dropped: 0,
    dropReasons: [],
  };
}

export function reconcileStatement(
  statement: ReconcileStatement,
  transactions: ReconcileTransaction[],
  parserConfidence = 0.5,
): ValidationResult {
  return validateStatement(toNormalizedStatement(statement, transactions), {
    parserConfidence,
  });
}
