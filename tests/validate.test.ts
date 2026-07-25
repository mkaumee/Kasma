import { describe, expect, test } from "vitest";

import { normalizeStatement } from "@/lib/extraction/normalize";
import { validateStatement } from "@/lib/extraction/validate";
import type { RawStatement } from "@/lib/extraction/types";

function normalize(partial: Partial<RawStatement>) {
  return normalizeStatement({ transactions: [], currency: "USD", ...partial });
}

describe("validateStatement", () => {
  test("a clean statement reconciles fully (high confidence, no breaks)", () => {
    const stmt = normalize({
      openingBalance: "1000.00",
      closingBalance: "2495.50",
      transactions: [
        { date: "2026-06-01", description: "Coffee", amount: "-4.50", balance: "995.50" },
        { date: "2026-06-02", description: "Salary", amount: "2000.00", balance: "2995.50" },
        { date: "2026-06-03", description: "Rent", amount: "-500.00", balance: "2495.50" },
      ],
    });
    const v = validateStatement(stmt, { parserConfidence: 0.9 });
    expect(v.ok).toBe(true);
    expect(v.breaks).toHaveLength(0);
    expect(v.closingOk).toBe(true);
    expect(v.closingDelta).toBe(0n);
    expect(v.computedClosing).toBe(249550n);
    expect(v.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test("a broken running balance is localized with the implied gap", () => {
    const stmt = normalize({
      openingBalance: "1000.00",
      closingBalance: "1995.50",
      transactions: [
        { date: "2026-06-01", description: "Coffee", amount: "-4.50", balance: "995.50" },
        { date: "2026-06-02", description: "Salary", amount: "2000.00", balance: "2995.50" },
        // Printed balance drops $1000 but amount is only -$500 → $500 unexplained.
        { date: "2026-06-03", description: "Rent", amount: "-500.00", balance: "1995.50" },
      ],
    });
    const v = validateStatement(stmt, { parserConfidence: 0.9 });
    expect(v.ok).toBe(false);
    expect(v.breaks).toHaveLength(1);
    expect(v.breaks[0]!.index).toBe(2);
    expect(v.breaks[0]!.expectedBalance).toBe(249550n);
    expect(v.breaks[0]!.actualBalance).toBe(199550n);
    expect(v.breaks[0]!.gap).toBe(-50000n);
    expect(v.closingOk).toBe(false);
    expect(v.confidence).toBeLessThan(0.7);
  });

  test("opening + closing reconcile even without per-row balances", () => {
    const stmt = normalize({
      openingBalance: "1000.00",
      closingBalance: "2495.50",
      transactions: [
        { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
        { date: "2026-06-02", description: "Salary", amount: "2000.00" },
        { date: "2026-06-03", description: "Rent", amount: "-500.00" },
      ],
    });
    const v = validateStatement(stmt, { parserConfidence: 0.9 });
    expect(v.hasBalances).toBe(false);
    expect(v.closingOk).toBe(true);
    expect(v.ok).toBe(true);
    expect(v.confidence).toBeGreaterThanOrEqual(0.95);
  });

  test("closing mismatch alone lowers confidence and fails", () => {
    const stmt = normalize({
      openingBalance: "1000.00",
      closingBalance: "9999.99",
      transactions: [
        { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
        { date: "2026-06-02", description: "Salary", amount: "2000.00" },
      ],
    });
    const v = validateStatement(stmt, { parserConfidence: 0.9 });
    expect(v.closingOk).toBe(false);
    expect(v.ok).toBe(false);
    expect(v.confidence).toBeLessThanOrEqual(0.45);
  });

  test("nothing to validate against caps confidence at the parser's", () => {
    const stmt = normalize({
      transactions: [
        { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
        { date: "2026-06-02", description: "Salary", amount: "2000.00" },
      ],
    });
    const v = validateStatement(stmt, { parserConfidence: 0.9 });
    expect(v.closingOk).toBeNull();
    expect(v.hasBalances).toBe(false);
    expect(v.ok).toBe(false);
    expect(v.confidence).toBeLessThanOrEqual(0.85);
  });

  test("respects a minor-unit tolerance", () => {
    const stmt = normalize({
      openingBalance: "1000.00",
      closingBalance: "1995.51", // 1 cent off
      transactions: [
        { date: "2026-06-01", description: "Salary", amount: "995.50" },
      ],
    });
    expect(validateStatement(stmt, { parserConfidence: 0.9 }).closingOk).toBe(
      false,
    );
    expect(
      validateStatement(stmt, { parserConfidence: 0.9, toleranceMinor: 1n })
        .closingOk,
    ).toBe(true);
  });
});
