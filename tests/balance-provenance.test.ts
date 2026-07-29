import { describe, expect, test } from "vitest";

import {
  mergeStatementMetadata,
  needsBalanceMetadata,
  headAndTail,
} from "@/lib/extraction/metadata";
import { normalizeStatement } from "@/lib/extraction/normalize";
import { validateBalances, validateStatement } from "@/lib/extraction/validate";
import type { RawStatement } from "@/lib/extraction/types";

/**
 * Balance provenance — the guardrail that keeps the "running balance is the
 * oracle" claim honest. Deriving BOTH ends from the rows makes the closing
 * identity true by algebra, so it must never be reported as verification.
 */

/** Rows carrying a printed running balance: 100.00 → 95.50 → 195.50. */
const ROWS_WITH_BALANCE: RawStatement = {
  currency: "USD",
  transactions: [
    { date: "2026-06-01", description: "Coffee", amount: "-4.50", balance: "95.50" },
    { date: "2026-06-02", description: "Salary", amount: "100.00", balance: "195.50" },
  ],
};

describe("normalizeStatement — balance inference", () => {
  test("derives opening and closing from the row balance column", () => {
    const s = normalizeStatement(ROWS_WITH_BALANCE, { fallbackCurrency: "USD" });
    // opening = first row's balance minus its own amount = 95.50 − (−4.50)
    expect(s.openingBalance).toBe(10000n);
    expect(s.closingBalance).toBe(19550n);
    expect(s.openingBalanceInferred).toBe(true);
    expect(s.closingBalanceInferred).toBe(true);
  });

  test("never overrides figures printed on the statement", () => {
    const s = normalizeStatement(
      { ...ROWS_WITH_BALANCE, openingBalance: "500.00", closingBalance: "600.00" },
      { fallbackCurrency: "USD" },
    );
    expect(s.openingBalance).toBe(50000n);
    expect(s.closingBalance).toBe(60000n);
    expect(s.openingBalanceInferred).toBe(false);
    expect(s.closingBalanceInferred).toBe(false);
  });

  test("leaves balances null when no row carries one", () => {
    const s = normalizeStatement(
      {
        currency: "USD",
        transactions: [{ date: "2026-06-01", description: "X", amount: "-4.50" }],
      },
      { fallbackCurrency: "USD" },
    );
    expect(s.openingBalance).toBeNull();
    expect(s.closingBalance).toBeNull();
    expect(s.openingBalanceInferred).toBe(false);
  });
});

describe("validate — circularity guard", () => {
  test("both-derived balances do NOT count as a passing closing check", () => {
    const s = normalizeStatement(ROWS_WITH_BALANCE, { fallbackCurrency: "USD" });
    const v = validateStatement(s, { parserConfidence: 0.9 });
    // The identity holds arithmetically, but proves nothing — so it is skipped.
    expect(v.closingOk).toBeNull();
    expect(v.closingDelta).toBeNull();
    // Row continuity is still genuine evidence, so this still reconciles.
    expect(v.hasBalances).toBe(true);
    expect(v.breaks).toHaveLength(0);
  });

  test("one printed side re-enables the closing check", () => {
    const v = validateBalances(
      {
        openingBalance: 10000n,
        closingBalance: 19550n,
        openingBalanceInferred: false, // read off the statement
        closingBalanceInferred: true,
        rows: [
          { amount: -450n, balance: 9550n },
          { amount: 10000n, balance: 19550n },
        ],
      },
      { parserConfidence: 0.9 },
    );
    expect(v.closingOk).toBe(true);
    expect(v.ok).toBe(true);
  });

  test("a printed closing that disagrees still surfaces the mismatch", () => {
    const v = validateBalances(
      {
        openingBalance: 10000n,
        closingBalance: 99999n, // printed, and wrong
        openingBalanceInferred: true,
        closingBalanceInferred: false,
        rows: [{ amount: -450n, balance: 9550n }],
      },
      { parserConfidence: 0.9 },
    );
    expect(v.closingOk).toBe(false);
    expect(v.ok).toBe(false);
  });
});

describe("needsBalanceMetadata", () => {
  const base = {
    openingBalance: 1n,
    closingBalance: 2n,
    openingBalanceInferred: false,
    closingBalanceInferred: false,
  };

  test("false when both were read off the statement", () => {
    expect(needsBalanceMetadata(base)).toBe(false);
  });

  test("true when both were derived from the rows (circular)", () => {
    expect(
      needsBalanceMetadata({
        ...base,
        openingBalanceInferred: true,
        closingBalanceInferred: true,
      }),
    ).toBe(true);
  });

  test("true when either is missing", () => {
    expect(needsBalanceMetadata({ ...base, closingBalance: null })).toBe(true);
    expect(needsBalanceMetadata({ ...base, openingBalance: null })).toBe(true);
  });

  test("false when only one side was derived", () => {
    expect(
      needsBalanceMetadata({ ...base, openingBalanceInferred: true }),
    ).toBe(false);
  });
});

describe("mergeStatementMetadata", () => {
  const meta = {
    openingBalance: "1000.00",
    closingBalance: "2000.00",
    periodStart: "2026-06-01",
    periodEnd: "2026-06-30",
    currency: "USD",
    bankName: "Test Bank",
    accountLast4: "****1234",
  };

  test("fills missing balances and marks them as read, not derived", () => {
    const s = normalizeStatement(
      {
        currency: "USD",
        transactions: [{ date: "2026-06-01", description: "X", amount: "-4.50" }],
      },
      { fallbackCurrency: "USD" },
    );
    const merged = mergeStatementMetadata(s, meta);
    expect(merged.openingBalance).toBe(100000n);
    expect(merged.closingBalance).toBe(200000n);
    expect(merged.openingBalanceInferred).toBe(false);
    expect(merged.closingBalanceInferred).toBe(false);
    expect(merged.bankName).toBe("Test Bank");
    expect(merged.accountLast4).toBe("1234");
    expect(merged.periodStart?.toISOString().slice(0, 10)).toBe("2026-06-01");
  });

  test("replaces row-derived balances (AI-read is independent evidence)", () => {
    const s = normalizeStatement(ROWS_WITH_BALANCE, { fallbackCurrency: "USD" });
    expect(s.openingBalanceInferred).toBe(true);

    const merged = mergeStatementMetadata(s, meta);
    expect(merged.openingBalance).toBe(100000n);
    expect(merged.openingBalanceInferred).toBe(false);
    // …which un-blocks the closing check that was previously circular.
    expect(validateStatement(merged, { parserConfidence: 0.9 }).closingOk).not.toBeNull();
  });

  test("never overwrites a balance printed on the statement", () => {
    const s = normalizeStatement(
      { ...ROWS_WITH_BALANCE, openingBalance: "7.00", closingBalance: "8.00" },
      { fallbackCurrency: "USD" },
    );
    const merged = mergeStatementMetadata(s, meta);
    expect(merged.openingBalance).toBe(700n);
    expect(merged.closingBalance).toBe(800n);
  });

  test("ignores null metadata fields", () => {
    const s = normalizeStatement(ROWS_WITH_BALANCE, { fallbackCurrency: "USD" });
    const merged = mergeStatementMetadata(s, {
      openingBalance: null,
      closingBalance: null,
      periodStart: null,
      periodEnd: null,
      currency: null,
      bankName: null,
      accountLast4: null,
    });
    expect(merged.openingBalance).toBe(s.openingBalance);
    expect(merged.openingBalanceInferred).toBe(true);
  });
});

describe("headAndTail", () => {
  test("returns short text unchanged", () => {
    expect(headAndTail("short", 10)).toBe("short");
  });

  test("keeps both ends of long text and elides the middle", () => {
    const out = headAndTail(`${"a".repeat(50)}${"b".repeat(50)}`, 10);
    expect(out.startsWith("aaaaaaaaaa")).toBe(true);
    expect(out.endsWith("bbbbbbbbbb")).toBe(true);
    expect(out).toContain("[…]");
    expect(out.length).toBeLessThan(60);
  });
});
