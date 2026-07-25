import { describe, expect, test } from "vitest";

import { inferType, normalizeStatement } from "@/lib/extraction/normalize";
import type { RawStatement } from "@/lib/extraction/types";

function statement(partial: Partial<RawStatement>): RawStatement {
  return { transactions: [], ...partial };
}

describe("normalizeStatement — amounts & direction", () => {
  test("signed single-amount column: negative = debit, positive = credit", () => {
    const norm = normalizeStatement(
      statement({
        currency: "USD",
        transactions: [
          { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
          { date: "2026-06-02", description: "Salary", amount: "2000.00" },
        ],
      }),
    );
    expect(norm.transactions).toHaveLength(2);
    expect(norm.transactions[0]!.amount).toBe(-450n);
    expect(norm.transactions[0]!.direction).toBe("DEBIT");
    expect(norm.transactions[1]!.amount).toBe(200000n);
    expect(norm.transactions[1]!.direction).toBe("CREDIT");
  });

  test("separate debit/credit columns", () => {
    const norm = normalizeStatement(
      statement({
        currency: "USD",
        transactions: [
          { date: "2026-06-01", description: "ATM", debit: "20.00" },
          { date: "2026-06-02", description: "Deposit", credit: "500.00" },
        ],
      }),
    );
    expect(norm.transactions[0]!.amount).toBe(-2000n);
    expect(norm.transactions[0]!.direction).toBe("DEBIT");
    expect(norm.transactions[1]!.amount).toBe(50000n);
    expect(norm.transactions[1]!.direction).toBe("CREDIT");
  });

  test("parentheses, DR/CR markers, and currency symbols", () => {
    const norm = normalizeStatement(
      statement({
        currency: "USD",
        transactions: [
          { date: "2026-06-01", description: "Fee", amount: "(15.00)" },
          { date: "2026-06-02", description: "Refund", amount: "$30.00 CR" },
          { date: "2026-06-03", description: "Card", amount: "12.34 DR" },
        ],
      }),
    );
    expect(norm.transactions[0]!.amount).toBe(-1500n);
    expect(norm.transactions[1]!.amount).toBe(3000n);
    expect(norm.transactions[1]!.direction).toBe("CREDIT");
    expect(norm.transactions[2]!.amount).toBe(-1234n);
    expect(norm.transactions[2]!.direction).toBe("DEBIT");
  });

  test("JPY (zero-decimal) amounts scale correctly", () => {
    const norm = normalizeStatement(
      statement({
        currency: "JPY",
        transactions: [{ date: "2026-06-01", description: "X", amount: "1500" }],
      }),
    );
    expect(norm.transactions[0]!.amount).toBe(1500n);
    expect(norm.currency).toBe("JPY");
  });

  test("parses signed running balances including overdrafts", () => {
    const norm = normalizeStatement(
      statement({
        currency: "USD",
        openingBalance: "1,000.00",
        closingBalance: "(250.00)",
        transactions: [
          { date: "2026-06-01", description: "X", amount: "-1250.00", balance: "(250.00)" },
        ],
      }),
    );
    expect(norm.openingBalance).toBe(100000n);
    expect(norm.closingBalance).toBe(-25000n);
    expect(norm.transactions[0]!.balance).toBe(-25000n);
  });
});

describe("normalizeStatement — rows, currency, metadata", () => {
  test("drops rows missing a date or an amount and counts them", () => {
    const norm = normalizeStatement(
      statement({
        currency: "USD",
        transactions: [
          { date: "2026-06-01", description: "Good", amount: "10.00" },
          { date: null, description: "No date", amount: "5.00" },
          { date: "2026-06-03", description: "No amount" },
        ],
      }),
    );
    expect(norm.transactions).toHaveLength(1);
    expect(norm.dropped).toBe(2);
  });

  test("falls back to the account currency, then USD", () => {
    expect(
      normalizeStatement(statement({ currency: null }), {
        fallbackCurrency: "EUR",
      }).currency,
    ).toBe("EUR");
    expect(normalizeStatement(statement({ currency: "???" })).currency).toBe(
      "USD",
    );
  });

  test("extracts last-4 from a masked account number", () => {
    expect(
      normalizeStatement(statement({ accountLast4: "**** **** 1234" }))
        .accountLast4,
    ).toBe("1234");
  });

  test("collapses whitespace and preserves the raw description", () => {
    const norm = normalizeStatement(
      statement({
        currency: "USD",
        transactions: [
          { date: "2026-06-01", description: "  ACME   CORP\tLTD ", amount: "1.00" },
        ],
      }),
    );
    expect(norm.transactions[0]!.description).toBe("ACME CORP LTD");
    expect(norm.transactions[0]!.rawDescription).toBe("ACME   CORP\tLTD");
  });
});

describe("inferType", () => {
  test("classifies by keyword, else by direction", () => {
    expect(inferType("Wire transfer to vendor", "DEBIT")).toBe("TRANSFER");
    expect(inferType("Monthly service charge", "DEBIT")).toBe("FEE");
    expect(inferType("Card charge", "DEBIT")).toBe("CHARGE");
    expect(inferType("Loan payment", "DEBIT")).toBe("PAYMENT");
    expect(inferType("Direct deposit", "CREDIT")).toBe("CREDIT");
    expect(inferType("Grocery store", "DEBIT")).toBe("DEBIT");
  });
});
