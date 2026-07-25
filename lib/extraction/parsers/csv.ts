import Papa from "papaparse";

import {
  hasEssentialColumns,
  mapColumns,
  type ColumnMap,
} from "@/lib/extraction/column-map";
import type { DetectedKind } from "@/lib/extraction/detect";
import type {
  ParseInput,
  ParseResult,
  Parser,
  RawStatement,
  RawTransactionRow,
} from "@/lib/extraction/types";

function cell(row: string[], index?: number): string | null {
  if (index === undefined) return null;
  const value = row[index];
  return value == null || value.trim() === "" ? null : value.trim();
}

/** Find the header row (first row that maps essential columns). */
function findHeader(
  rows: string[][],
): { headerIndex: number; map: ColumnMap } | null {
  const limit = Math.min(rows.length, 20);
  let fallback: { headerIndex: number; map: ColumnMap } | null = null;
  for (let i = 0; i < limit; i++) {
    const map = mapColumns(rows[i] ?? []);
    if (hasEssentialColumns(map)) return { headerIndex: i, map };
    if (!fallback && Object.keys(map).length >= 2) {
      fallback = { headerIndex: i, map };
    }
  }
  return fallback;
}

export const csvParser: Parser = {
  name: "csv",

  supports(kind: DetectedKind) {
    return kind === "csv";
  },

  async parse(input: ParseInput): Promise<ParseResult> {
    const text = input.bytes.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = parsed.data.filter((row): row is string[] =>
      Array.isArray(row),
    );

    const header = findHeader(rows);
    if (!header) {
      return { parser: "csv", confidence: 0.1, raw: { transactions: [] } };
    }

    const { headerIndex, map } = header;
    const transactions: RawTransactionRow[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i] ?? [];
      const date = cell(row, map.date) ?? cell(row, map.valueDate);
      const amount = cell(row, map.amount);
      const debit = cell(row, map.debit);
      const credit = cell(row, map.credit);
      // Skip metadata/blank rows with no date and no amount signal.
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
      currency: input.hintCurrency ?? null,
      transactions,
    };
    const confidence =
      hasEssentialColumns(map) && transactions.length > 0 ? 0.9 : 0.4;

    return {
      parser: "csv",
      confidence,
      raw,
      meta: { headerIndex, columns: map },
    };
  },
};
