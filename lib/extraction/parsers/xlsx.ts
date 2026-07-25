import ExcelJS from "exceljs";

import type { DetectedKind } from "@/lib/extraction/detect";
import { extractFromRows, type TableRow } from "@/lib/extraction/tabular";
import type { ParseInput, ParseResult, Parser } from "@/lib/extraction/types";

function cellToString(value: ExcelJS.CellValue): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value && value.result != null) return String(value.result);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((r) => r.text).join("");
    }
    return null;
  }
  return String(value);
}

export const xlsxParser: Parser = {
  name: "xlsx",

  supports(kind: DetectedKind) {
    return kind === "xlsx";
  },

  async parse(input: ParseInput): Promise<ParseResult> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(input.bytes as unknown as ArrayBuffer);

    const sheet = workbook.worksheets[0];
    if (!sheet) {
      return {
        parser: "xlsx",
        confidence: 0.1,
        raw: { currency: input.hintCurrency ?? null, transactions: [] },
      };
    }

    const rows: TableRow[] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      // exceljs row.values is 1-indexed (index 0 is empty).
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map((v) => cellToString(v as ExcelJS.CellValue)));
    });

    const { raw, confidence, headerIndex, columns } = extractFromRows(
      rows,
      input.hintCurrency,
    );

    return {
      parser: "xlsx",
      confidence,
      raw,
      meta: { headerIndex, columns, sheet: sheet.name },
    };
  },
};
