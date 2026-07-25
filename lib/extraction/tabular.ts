import {
  hasEssentialColumns,
  mapColumns,
  type ColumnMap,
} from "@/lib/extraction/column-map";
import type { RawStatement, RawTransactionRow } from "@/lib/extraction/types";

export type TableRow = (string | null | undefined)[];

function cell(row: TableRow, index?: number): string | null {
  if (index === undefined) return null;
  const value = row[index];
  if (value == null) return null;
  const str = String(value).trim();
  return str === "" ? null : str;
}

function findHeader(
  rows: TableRow[],
): { headerIndex: number; map: ColumnMap } | null {
  const limit = Math.min(rows.length, 20);
  let fallback: { headerIndex: number; map: ColumnMap } | null = null;
  for (let i = 0; i < limit; i++) {
    const map = mapColumns(
      (rows[i] ?? []).map((c) => (c == null ? "" : String(c))),
    );
    if (hasEssentialColumns(map)) return { headerIndex: i, map };
    if (!fallback && Object.keys(map).length >= 2) {
      fallback = { headerIndex: i, map };
    }
  }
  return fallback;
}

export type TabularExtraction = {
  raw: RawStatement;
  confidence: number;
  headerIndex: number | null;
  columns: ColumnMap;
};

/**
 * Turn a grid of rows (from CSV or a spreadsheet) into a RawStatement by
 * locating the header row and mapping its columns to transaction fields.
 */
export function extractFromRows(
  rows: TableRow[],
  hintCurrency?: string,
): TabularExtraction {
  const header = findHeader(rows);
  if (!header) {
    return {
      raw: { currency: hintCurrency ?? null, transactions: [] },
      confidence: 0.1,
      headerIndex: null,
      columns: {},
    };
  }

  const { headerIndex, map } = header;
  const transactions: RawTransactionRow[] = [];
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const date = cell(row, map.date) ?? cell(row, map.valueDate);
    const amount = cell(row, map.amount);
    const debit = cell(row, map.debit);
    const credit = cell(row, map.credit);
    if (!date && !amount && !debit && !credit) continue;

    transactions.push({
      date,
      valueDate: cell(row, map.valueDate),
      description: cell(row, map.description),
      amount,
      debit,
      credit,
      balance: cell(row, map.balance),
      reference: cell(row, map.reference),
      counterparty: cell(row, map.counterparty),
    });
  }

  const raw: RawStatement = {
    currency: hintCurrency ?? null,
    transactions,
  };
  const confidence =
    hasEssentialColumns(map) && transactions.length > 0 ? 0.9 : 0.4;

  return { raw, confidence, headerIndex, columns: map };
}
