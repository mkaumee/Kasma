import { TxnDirection, TxnType } from "@prisma/client";

import { parseStatementDate, type DateOrder } from "@/lib/extraction/dates";
import { redactAccountNumbers } from "@/lib/extraction/llm-schema";
import type { RawStatement, RawTransactionRow } from "@/lib/extraction/types";
import { isCurrencyCode, parseMoney } from "@/lib/money/currency";

/**
 * Normalizer — turns a loosely-typed {@link RawStatement} (from any parser or
 * the Claude fallback) into canonical transactions with money as signed BigInt
 * minor units, an explicit direction, and an inferred type. Downstream stages
 * (validation, dedupe, persistence) operate only on this canonical shape.
 */

export type NormalizedTransaction = {
  date: Date;
  valueDate: Date | null;
  /** Whitespace-collapsed description. */
  description: string;
  /** Original description, preserved for audit/dedupe stability. */
  rawDescription: string;
  /** Signed amount in minor units (negative = debit). */
  amount: bigint;
  direction: TxnDirection;
  type: TxnType;
  /** Printed running balance in minor units, when the row carries one. */
  balance: bigint | null;
  currency: string;
  counterparty: string | null;
  reference: string | null;
};

export type NormalizedStatement = {
  currency: string;
  bankName: string | null;
  accountLast4: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  openingBalance: bigint | null;
  closingBalance: bigint | null;
  /**
   * Balance provenance. `true` means the figure was *derived from the rows*
   * rather than read off the statement.
   *
   * This matters for correctness, not bookkeeping: an opening derived from
   * `row[0].balance - row[0].amount` together with a closing taken from
   * `lastRow.balance` makes `opening + Σamounts == closing` true by algebra
   * whenever row continuity holds. Treating that as a passing closing check
   * would manufacture proof out of nothing. The validator therefore only runs
   * the closing check when at least one side was genuinely read (see
   * validate.ts). The derived values are still useful for display and for
   * cross-statement continuity (MISSING_STATEMENT detection).
   */
  openingBalanceInferred: boolean;
  closingBalanceInferred: boolean;
  transactions: NormalizedTransaction[];
  /** Rows that could not be normalized (missing a date or an amount). */
  dropped: number;
  /**
   * Why rows were dropped, capped and redacted. A bare count is useless for
   * diagnosis: "dropped: 4" cannot distinguish a scan that yielded nothing from
   * a table whose columns were mis-split into `"2026-06-01 Coffee Shop"`.
   */
  dropReasons: DropReason[];
};

export type DropReason = {
  /** 0-based index of the offending row in the raw input. */
  index: number;
  /** Which required field could not be parsed. */
  field: "date" | "amount";
  /** The offending value, truncated and PII-redacted. */
  value: string;
};

/** Enough to spot a pattern, few enough to store in a log line or a note. */
const MAX_DROP_REASONS = 5;

export type NormalizeOptions = {
  /** Account currency, used when the statement omits a valid one. */
  fallbackCurrency?: string;
  /** How to read ambiguous numeric dates (default day-first). */
  dateOrder?: DateOrder;
};

function resolveCurrency(raw: string | null | undefined, fallback?: string): string {
  const candidate = (raw ?? "").trim().toUpperCase();
  if (isCurrencyCode(candidate)) return candidate;
  const fb = (fallback ?? "").trim().toUpperCase();
  if (isCurrencyCode(fb)) return fb;
  return "USD";
}

function sanitizeLast4(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 0) return null;
  return digits.slice(-4);
}

function cleanOptional(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toString().replace(/\s+/g, " ").trim();
  return s === "" ? null : s;
}

/** Parse a signed money value (handles parentheses-negatives and symbols). */
export function parseSignedMoney(
  raw: string | number | null | undefined,
  currency: string,
): bigint | null {
  if (raw == null) return null;
  let s = String(raw).trim();
  if (s === "") return null;
  let negate = false;
  if (/^\(.*\)$/.test(s)) {
    negate = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[^0-9.,-]/g, "");
  let val = parseMoney(s, currency);
  if (val == null) return null;
  if (negate && val > 0n) val = -val;
  return val;
}

/** Absolute magnitude of a money token, ignoring any sign. */
function parseMagnitude(
  raw: string | number | null | undefined,
  currency: string,
): bigint | null {
  const val = parseSignedMoney(raw, currency);
  if (val == null) return null;
  return val < 0n ? -val : val;
}

/** Detect an explicit sign marker on a single-amount token. */
function amountSign(raw: string): -1 | 0 | 1 {
  const lower = raw.toLowerCase();
  if (/\(\s*[\d.,]+\s*\)/.test(raw)) return -1;
  if (/\bdr\b|debit/.test(lower)) return -1;
  if (/\bcr\b|credit/.test(lower)) return 1;
  if (raw.trim().startsWith("-") || /-\s*[\d.,]/.test(raw)) return -1;
  return 0;
}

type ResolvedAmount = { amount: bigint; direction: TxnDirection };

/** Resolve a row's signed amount + direction from its amount/debit/credit. */
function resolveAmount(
  row: RawTransactionRow,
  currency: string,
): ResolvedAmount | null {
  if (row.amount != null && String(row.amount).trim() !== "") {
    const mag = parseMagnitude(row.amount, currency);
    if (mag == null) return null;
    const sign = amountSign(String(row.amount));
    const amount = sign === -1 ? -mag : mag;
    return {
      amount,
      direction: amount < 0n ? TxnDirection.DEBIT : TxnDirection.CREDIT,
    };
  }

  const creditMag = parseMagnitude(row.credit, currency);
  const debitMag = parseMagnitude(row.debit, currency);
  if (creditMag != null && creditMag !== 0n && (debitMag == null || debitMag === 0n)) {
    return { amount: creditMag, direction: TxnDirection.CREDIT };
  }
  if (debitMag != null && debitMag !== 0n) {
    return { amount: -debitMag, direction: TxnDirection.DEBIT };
  }
  // Both columns present: net them (credit positive, debit negative).
  if (creditMag != null || debitMag != null) {
    const net = (creditMag ?? 0n) - (debitMag ?? 0n);
    return {
      amount: net,
      direction: net < 0n ? TxnDirection.DEBIT : TxnDirection.CREDIT,
    };
  }
  return null;
}

/** Infer a transaction type from its description, falling back to direction. */
export function inferType(
  description: string,
  direction: TxnDirection,
): TxnType {
  const d = description.toLowerCase();
  if (/\btransfer\b|\bxfer\b|\btrf\b|\bwire\b/.test(d)) return TxnType.TRANSFER;
  if (/\bfee\b|service charge|overdraft|maintenance/.test(d)) return TxnType.FEE;
  if (/\bcharge\b/.test(d)) return TxnType.CHARGE;
  if (/\bpayment\b|\bpmt\b|bill pay|direct debit|standing order/.test(d)) {
    return TxnType.PAYMENT;
  }
  return direction === TxnDirection.CREDIT ? TxnType.CREDIT : TxnType.DEBIT;
}

/** Truncate + redact a rejected cell so it is safe to log and store. */
function sampleValue(raw: unknown): string {
  const s = raw == null ? "" : String(raw).replace(/\s+/g, " ").trim();
  return redactAccountNumbers(s.slice(0, 60));
}

function normalizeRow(
  row: RawTransactionRow,
  currency: string,
  order: DateOrder,
): NormalizedTransaction | { drop: Omit<DropReason, "index"> } {
  const date = parseStatementDate(row.date ?? row.valueDate, order);
  const money = resolveAmount(row, currency);

  // Report which field failed, and with what, rather than a silent null. A
  // mis-split column shows up here as a date like "2026-06-01 Coffee Shop".
  if (!date) {
    return {
      drop: { field: "date", value: sampleValue(row.date ?? row.valueDate) },
    };
  }
  if (!money) {
    return {
      drop: {
        field: "amount",
        value: sampleValue(row.amount ?? row.debit ?? row.credit),
      },
    };
  }

  const rawDescription = (row.description ?? "").toString().trim();
  const description = rawDescription.replace(/\s+/g, " ").trim() || "(no description)";

  return {
    date,
    valueDate: parseStatementDate(row.valueDate, order),
    description,
    rawDescription,
    amount: money.amount,
    direction: money.direction,
    type: inferType(description, money.direction),
    balance: parseSignedMoney(row.balance, currency),
    currency,
    counterparty: cleanOptional(row.counterparty),
    reference: cleanOptional(row.reference),
  };
}

/**
 * Derive the statement's opening/closing balance from the rows' printed running
 * balance, for the many statements (every CSV/XLSX/PDF-table one) that carry a
 * balance column but no summary figures. Only fills what is missing — a value
 * read off the statement always wins.
 *
 * opening = firstBalanceRow.balance − firstBalanceRow.amount (the balance
 * *before* that row); closing = lastBalanceRow.balance.
 */
function inferBalances(
  transactions: NormalizedTransaction[],
  printedOpening: bigint | null,
  printedClosing: bigint | null,
): {
  openingBalance: bigint | null;
  closingBalance: bigint | null;
  openingBalanceInferred: boolean;
  closingBalanceInferred: boolean;
} {
  const first = transactions.find((t) => t.balance != null);
  const last = [...transactions].reverse().find((t) => t.balance != null);

  const opening =
    printedOpening ?? (first ? first.balance! - first.amount : null);
  const closing = printedClosing ?? last?.balance ?? null;

  return {
    openingBalance: opening,
    closingBalance: closing,
    openingBalanceInferred: printedOpening == null && opening != null,
    closingBalanceInferred: printedClosing == null && closing != null,
  };
}

/** Normalize a raw statement into canonical transactions. */
export function normalizeStatement(
  raw: RawStatement,
  opts: NormalizeOptions = {},
): NormalizedStatement {
  const currency = resolveCurrency(raw.currency, opts.fallbackCurrency);
  const order = opts.dateOrder ?? "DMY";

  const transactions: NormalizedTransaction[] = [];
  const dropReasons: DropReason[] = [];
  let dropped = 0;
  for (const [index, row] of raw.transactions.entries()) {
    const norm = normalizeRow(row, currency, order);
    if ("drop" in norm) {
      dropped += 1;
      if (dropReasons.length < MAX_DROP_REASONS) {
        dropReasons.push({ index, ...norm.drop });
      }
    } else {
      transactions.push(norm);
    }
  }

  const balances = inferBalances(
    transactions,
    parseSignedMoney(raw.openingBalance, currency),
    parseSignedMoney(raw.closingBalance, currency),
  );

  return {
    currency,
    bankName: cleanOptional(raw.bankName),
    accountLast4: sanitizeLast4(raw.accountLast4),
    periodStart: parseStatementDate(raw.periodStart, order),
    periodEnd: parseStatementDate(raw.periodEnd, order),
    ...balances,
    transactions,
    dropped,
    dropReasons,
  };
}
