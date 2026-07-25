import ExcelJS from "exceljs";
import { describe, expect, test } from "vitest";

import { xlsxParser } from "@/lib/extraction/parsers/xlsx";

async function makeXlsx(rows: (string | number)[][]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("xlsx parser", () => {
  test("extracts transactions from a spreadsheet", async () => {
    const bytes = await makeXlsx([
      ["Date", "Description", "Amount", "Balance"],
      ["2026-06-02", "Coffee", -4.5, 995.5],
      ["2026-06-03", "Salary", 2000, 2995.5],
    ]);

    const result = await xlsxParser.parse({
      bytes,
      filename: "statement.xlsx",
      hintCurrency: "USD",
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.raw.transactions).toHaveLength(2);
    expect(result.raw.transactions[0]).toMatchObject({
      description: "Coffee",
      amount: "-4.5",
    });
    expect(result.raw.transactions[1]?.description).toBe("Salary");
  });
});
