import {
  type Prisma,
  type TxnDirection,
  type TxnType,
  type VerificationStatus,
} from "@prisma/client";

import { parseMoney } from "@/lib/money/currency";
import type { LedgerQuery } from "@/lib/transactions/url";

/**
 * Ledger filter parsing + Prisma `where` construction. Kept pure so it can be
 * unit-tested and shared between the page (URL → where) and any export.
 */

export type LedgerFilters = {
  search?: string;
  accountId?: string;
  direction?: TxnDirection;
  type?: TxnType;
  /** A category id, or "none" for uncategorized. */
  categoryId?: string;
  verification?: VerificationStatus;
  dateFrom?: string; // yyyy-mm-dd
  dateTo?: string; // yyyy-mm-dd
  amountMin?: string; // decimal, magnitude
  amountMax?: string; // decimal, magnitude
};

const DIRECTIONS = new Set<TxnDirection>(["CREDIT", "DEBIT"]);
const TYPES = new Set<TxnType>([
  "CREDIT",
  "DEBIT",
  "CHARGE",
  "FEE",
  "PAYMENT",
  "TRANSFER",
]);
const VERIFICATIONS = new Set<VerificationStatus>([
  "UNVERIFIED",
  "VERIFIED",
  "DISPUTED",
]);

const isDate = (v?: string) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function parseLedgerFilters(query: LedgerQuery): LedgerFilters {
  const filters: LedgerFilters = {};
  const search = query.q?.trim();
  if (search) filters.search = search.slice(0, 200);
  if (query.account) filters.accountId = query.account;
  if (query.direction && DIRECTIONS.has(query.direction as TxnDirection)) {
    filters.direction = query.direction as TxnDirection;
  }
  if (query.type && TYPES.has(query.type as TxnType)) {
    filters.type = query.type as TxnType;
  }
  if (query.category) filters.categoryId = query.category;
  if (
    query.verification &&
    VERIFICATIONS.has(query.verification as VerificationStatus)
  ) {
    filters.verification = query.verification as VerificationStatus;
  }
  if (isDate(query.from)) filters.dateFrom = query.from;
  if (isDate(query.to)) filters.dateTo = query.to;
  if (query.min?.trim()) filters.amountMin = query.min.trim();
  if (query.max?.trim()) filters.amountMax = query.max.trim();
  return filters;
}

/** True when at least one filter is active. */
export function hasActiveFilters(f: LedgerFilters): boolean {
  return Object.values(f).some((v) => v !== undefined && v !== "");
}

/**
 * Build a Prisma where from filters. Amount magnitude is interpreted in major
 * units with 2 decimals (best-effort across currencies).
 */
export function ledgerWhere(
  filters: LedgerFilters,
): Prisma.TransactionWhereInput {
  const where: Prisma.TransactionWhereInput = {};
  const and: Prisma.TransactionWhereInput[] = [];

  if (filters.search) {
    where.OR = [
      { description: { contains: filters.search, mode: "insensitive" } },
      { counterparty: { contains: filters.search, mode: "insensitive" } },
      { reference: { contains: filters.search, mode: "insensitive" } },
    ];
  }
  if (filters.accountId) where.bankAccountId = filters.accountId;
  if (filters.direction) where.direction = filters.direction;
  if (filters.type) where.type = filters.type;
  if (filters.categoryId === "none") where.categoryId = null;
  else if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.verification) where.verificationStatus = filters.verification;

  if (filters.dateFrom || filters.dateTo) {
    where.date = {};
    if (filters.dateFrom) {
      where.date.gte = new Date(`${filters.dateFrom}T00:00:00.000Z`);
    }
    if (filters.dateTo) {
      where.date.lte = new Date(`${filters.dateTo}T23:59:59.999Z`);
    }
  }

  const min = filters.amountMin ? parseMoney(filters.amountMin, "USD") : null;
  const max = filters.amountMax ? parseMoney(filters.amountMax, "USD") : null;
  if (min != null) {
    const m = min < 0n ? -min : min;
    and.push({ OR: [{ amount: { gte: m } }, { amount: { lte: -m } }] });
  }
  if (max != null) {
    const m = max < 0n ? -max : max;
    and.push({ AND: [{ amount: { lte: m } }, { amount: { gte: -m } }] });
  }
  if (and.length > 0) where.AND = and;

  return where;
}
