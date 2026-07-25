import { describe, expect, test } from "vitest";

import {
  formatMoney,
  minorToDecimalString,
  parseMoney,
} from "@/lib/money/currency";

describe("money", () => {
  test("parseMoney handles decimals, separators, and signs", () => {
    expect(parseMoney("1234.56", "USD")).toBe(123456n);
    expect(parseMoney("1,234.56", "USD")).toBe(123456n);
    expect(parseMoney("1000", "USD")).toBe(100000n);
    expect(parseMoney("-42.10", "USD")).toBe(-4210n);
    expect(parseMoney("0.05", "USD")).toBe(5n);
  });

  test("parseMoney respects zero-decimal currencies", () => {
    expect(parseMoney("1500", "JPY")).toBe(1500n);
    // Significant fractional digits beyond precision are rejected.
    expect(parseMoney("1500.5", "JPY")).toBeNull();
  });

  test("parseMoney rejects invalid input", () => {
    expect(parseMoney("", "USD")).toBeNull();
    expect(parseMoney("abc", "USD")).toBeNull();
    expect(parseMoney("1.2.3", "USD")).toBeNull();
    // Too many significant decimals for USD.
    expect(parseMoney("1.234", "USD")).toBeNull();
  });

  test("minorToDecimalString round-trips with parseMoney", () => {
    for (const value of [0n, 5n, 100000n, -4210n, 999999999n]) {
      const s = minorToDecimalString(value, "USD");
      expect(parseMoney(s, "USD")).toBe(value);
    }
  });

  test("formatMoney renders a localized currency string", () => {
    expect(formatMoney(123456n, "USD")).toBe("$1,234.56");
    expect(formatMoney(-4210n, "USD")).toBe("-$42.10");
    expect(formatMoney(1500n, "JPY")).toBe("¥1,500");
  });
});
