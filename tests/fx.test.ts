import { describe, expect, test } from "vitest";

import { convertMinor, totalInBaseCurrency } from "@/lib/money/fx";

describe("fx", () => {
  test("identity conversion returns the same amount", () => {
    expect(convertMinor(123456n, "USD", "USD")).toBe(123456n);
  });

  test("converts across currencies via USD rates", () => {
    // $1,000.00 at 0.92 EUR/USD => €920.00
    expect(convertMinor(100000n, "USD", "EUR")).toBe(92000n);
    // €920.00 back to USD => ~$1,000.00
    expect(convertMinor(92000n, "EUR", "USD")).toBe(100000n);
  });

  test("handles differing decimal places (JPY has 0)", () => {
    // $10.00 -> JPY at 151 => ¥1510 (0 decimals)
    expect(convertMinor(1000n, "USD", "JPY")).toBe(1510n);
  });

  test("unknown currency yields null", () => {
    expect(convertMinor(1000n, "USD", "XXX")).toBeNull();
  });

  test("totalInBaseCurrency sums converted balances and flags unknowns", () => {
    const result = totalInBaseCurrency(
      [
        { currentBalance: 100000n, currency: "USD" }, // $1,000
        { currentBalance: 92000n, currency: "EUR" }, // -> $1,000
        { currentBalance: 5000n, currency: "XXX" }, // skipped
      ],
      "USD",
    );
    expect(result.total).toBe(200000n);
    expect(result.hasUnconvertible).toBe(true);
  });
});
