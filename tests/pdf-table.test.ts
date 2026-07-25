import { describe, expect, test } from "vitest";

import { itemsToRows, type TextItem } from "@/lib/extraction/pdf-table";
import { extractFromRows } from "@/lib/extraction/tabular";

// A synthetic 3-column statement table (PDF y increases upward).
const items: TextItem[] = [
  { str: "Date", x: 10, y: 100 },
  { str: "Description", x: 60, y: 100 },
  { str: "Amount", x: 200, y: 100 },
  { str: "2026-06-02", x: 10, y: 90 },
  { str: "Coffee", x: 60, y: 90 },
  { str: "-4.50", x: 200, y: 90 },
  { str: "2026-06-03", x: 10, y: 80 },
  { str: "Salary", x: 60, y: 80 },
  { str: "2000.00", x: 200, y: 80 },
];

describe("pdf table reconstruction", () => {
  test("reconstructs rows from positioned text items", () => {
    const rows = itemsToRows(items);
    expect(rows[0]).toEqual(["Date", "Description", "Amount"]);
    expect(rows[1]).toEqual(["2026-06-02", "Coffee", "-4.50"]);
    expect(rows[2]).toEqual(["2026-06-03", "Salary", "2000.00"]);
  });

  test("reconstructed rows extract into transactions", () => {
    const { raw, confidence } = extractFromRows(itemsToRows(items), "USD");
    expect(confidence).toBeGreaterThanOrEqual(0.9);
    expect(raw.transactions).toHaveLength(2);
    expect(raw.transactions[0]).toMatchObject({
      description: "Coffee",
      amount: "-4.50",
    });
  });
});
