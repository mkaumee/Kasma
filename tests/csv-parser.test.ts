import { describe, expect, test } from "vitest";

import { csvParser } from "@/lib/extraction/parsers/csv";

async function parse(text: string) {
  return csvParser.parse({
    bytes: Buffer.from(text, "utf8"),
    filename: "statement.csv",
    hintCurrency: "USD",
  });
}

describe("csv parser", () => {
  test("extracts rows from a single signed-amount column", async () => {
    const result = await parse(
      [
        "Date,Description,Amount,Balance",
        "2026-06-02,Coffee,-4.50,995.50",
        "2026-06-03,Salary,2000.00,2995.50",
      ].join("\n"),
    );
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    expect(result.raw.transactions).toHaveLength(2);
    expect(result.raw.transactions[0]).toMatchObject({
      date: "2026-06-02",
      description: "Coffee",
      amount: "-4.50",
      balance: "995.50",
    });
  });

  test("extracts separate debit/credit columns", async () => {
    const result = await parse(
      [
        "Date,Details,Debit,Credit,Balance",
        "01/06/2026,ATM,50.00,,950.00",
        "02/06/2026,Refund,,20.00,970.00",
      ].join("\n"),
    );
    expect(result.raw.transactions).toHaveLength(2);
    expect(result.raw.transactions[0]).toMatchObject({
      debit: "50.00",
      credit: null,
    });
    expect(result.raw.transactions[1]).toMatchObject({
      debit: null,
      credit: "20.00",
    });
  });

  test("skips preamble lines before the header", async () => {
    const result = await parse(
      [
        "Acme Bank",
        "Statement for account ****4821",
        "",
        "Date,Description,Amount",
        "2026-06-02,Coffee,-4.50",
      ].join("\n"),
    );
    expect(result.raw.transactions).toHaveLength(1);
    expect(result.raw.transactions[0]?.description).toBe("Coffee");
  });
});
