import { beforeEach, describe, expect, test, vi } from "vitest";

import { describeExtraction } from "@/lib/extraction/diagnostics";
import { normalizeStatement } from "@/lib/extraction/normalize";
import { effectiveConfidence } from "@/lib/extraction/registry";
import type { ParseResult, RawStatement } from "@/lib/extraction/types";

/**
 * Usable-row accounting.
 *
 * A real statement reported `confidence 0.85, dropped 4, inserted 0`: the PDF
 * table reader had mis-split its columns, so every row carried a value like
 * "2026-06-01 Coffee Shop" that no date parser accepts. Because 0.85 clears the
 * LLM fallback threshold, the one extractor that could have read the file was
 * never consulted, and the only record of the failure was the number 4.
 */

/**
 * Columns mis-split, as a real PDF produces: the amount cell swallowed the
 * balance that followed it. (Note the dates here also carry trailing text —
 * `parseStatementDate` tolerates that, so the amount is what actually fails.)
 */
const MANGLED: RawStatement = {
  currency: "USD",
  transactions: [
    { date: "2026-06-01 Coffee Shop", amount: "-4.50 995.50" },
    { date: "2026-06-02 Salary Payment", amount: "2000.00 2995.50" },
    { date: "2026-06-03 Rent", amount: "-500.00 2495.50" },
    { date: "2026-06-04 Fees", amount: "-1.00 2494.50" },
  ],
};

const CLEAN: RawStatement = {
  currency: "USD",
  transactions: [
    { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
    { date: "2026-06-02", description: "Salary", amount: "2000.00" },
  ],
};

function result(raw: RawStatement, confidence: number): ParseResult {
  return { parser: "pdf", confidence, raw };
}

describe("normalizeStatement — drop reasons", () => {
  test("names the failing field and shows the offending value", () => {
    const s = normalizeStatement(MANGLED, { fallbackCurrency: "USD" });
    expect(s.transactions).toHaveLength(0);
    expect(s.dropped).toBe(4);

    const first = s.dropReasons[0]!;
    expect(first.index).toBe(0);
    expect(first.field).toBe("amount");
    // The merged cell is visible, which is what makes this diagnosable.
    expect(first.value).toContain("995.50");
  });

  test("caps the number of reasons it keeps", () => {
    const many: RawStatement = {
      currency: "USD",
      transactions: Array.from({ length: 40 }, () => ({
        date: "nonsense",
        amount: "1.00",
      })),
    };
    const s = normalizeStatement(many, { fallbackCurrency: "USD" });
    expect(s.dropped).toBe(40);
    expect(s.dropReasons.length).toBeLessThanOrEqual(5);
  });

  test("redacts an account-number-looking value", () => {
    const s = normalizeStatement(
      {
        currency: "USD",
        transactions: [{ date: "4111 1111 1111 1234", amount: "1.00" }],
      },
      { fallbackCurrency: "USD" },
    );
    expect(s.dropReasons[0]!.value).not.toContain("4111 1111 1111 1234");
    expect(s.dropReasons[0]!.value).toContain("1234");
  });

  test("reports no reasons when every row is usable", () => {
    const s = normalizeStatement(CLEAN, { fallbackCurrency: "USD" });
    expect(s.dropped).toBe(0);
    expect(s.dropReasons).toEqual([]);
  });
});

describe("effectiveConfidence", () => {
  test("floors a parse whose rows are all unusable", () => {
    // The exact production case: 0.85 must not survive as 0.85.
    expect(effectiveConfidence(result(MANGLED, 0.85), "USD")).toBeLessThan(0.6);
  });

  test("leaves a fully usable parse at its reported confidence", () => {
    expect(effectiveConfidence(result(CLEAN, 0.85), "USD")).toBeCloseTo(0.85);
  });

  test("scales proportionally when only some rows are usable", () => {
    const half: RawStatement = {
      currency: "USD",
      transactions: [...CLEAN.transactions, { date: "junk", amount: "junk" }],
    };
    const score = effectiveConfidence(result(half, 0.9), "USD");
    expect(score).toBeCloseTo(0.9 * (2 / 3));
  });

  test("floors an empty parse", () => {
    expect(
      effectiveConfidence(result({ currency: "USD", transactions: [] }, 0.9), "USD"),
    ).toBe(0.05);
  });
});

describe("parseStatement — falls through on unusable rows", () => {
  const llmResult: ParseResult = {
    parser: "deepseek",
    confidence: 0.7,
    raw: {
      currency: "USD",
      transactions: [
        { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
      ],
    },
  };

  beforeEach(() => {
    vi.resetModules();
  });

  test("a high-scoring parse with zero usable rows yields to the LLM", async () => {
    vi.doMock("@/lib/extraction/llm", () => ({
      isLlmAvailable: () => true,
      llmExtract: vi.fn(async () => llmResult),
    }));
    // A CSV whose amount column is unparseable everywhere: the header is found
    // (so the parser is confident) but no row normalizes.
    const csv =
      "Date,Description,Amount\n" +
      "not-a-date,Coffee,not-a-number\n" +
      "also-bad,Salary,also-bad\n";

    const { parseStatement } = await import("@/lib/extraction/parsers");
    const res = await parseStatement({
      bytes: Buffer.from(csv),
      filename: "june.csv",
      hintCurrency: "USD",
    });
    expect(res.parser).toBe("deepseek");
  });

  test("a healthy parse never calls the LLM (no new API cost)", async () => {
    const llmExtract = vi.fn(async () => llmResult);
    vi.doMock("@/lib/extraction/llm", () => ({
      isLlmAvailable: () => true,
      llmExtract,
    }));
    const csv =
      "Date,Description,Amount\n" +
      "2026-06-01,Coffee,-4.50\n" +
      "2026-06-02,Salary,2000.00\n";

    const { parseStatement } = await import("@/lib/extraction/parsers");
    const res = await parseStatement({
      bytes: Buffer.from(csv),
      filename: "june.csv",
      hintCurrency: "USD",
    });
    expect(res.parser).toBe("csv");
    expect(llmExtract).not.toHaveBeenCalled();
  });
});

describe("describeExtraction — rows found but unusable", () => {
  test("does not claim nothing was found", () => {
    const s = normalizeStatement(MANGLED, { fallbackCurrency: "USD" });
    const note = describeExtraction(result(MANGLED, 0.85), {
      kept: s.transactions.length,
      dropped: s.dropped,
      dropReasons: s.dropReasons,
    })!;

    expect(note).toContain("Found 4 rows");
    expect(note).not.toMatch(/No transactions were found/i);
    // Names the failing field and quotes the value that broke it.
    expect(note).toContain("amount");
    expect(note).toContain("995.50");
  });

  test("mentions partial skips when some rows survived", () => {
    const partial: RawStatement = {
      currency: "USD",
      transactions: [...CLEAN.transactions, { date: "junk", amount: "junk" }],
    };
    const s = normalizeStatement(partial, { fallbackCurrency: "USD" });
    const note = describeExtraction(result(partial, 0.9), {
      kept: s.transactions.length,
      dropped: s.dropped,
      dropReasons: s.dropReasons,
    })!;
    expect(note).toContain("Imported 2");
    expect(note).toContain("skipped 1");
  });

  test("still reports an empty file as empty", () => {
    const empty = { currency: "USD", transactions: [] };
    const note = describeExtraction(result(empty, 0.1), {
      kept: 0,
      dropped: 0,
      dropReasons: [],
    })!;
    expect(note).toMatch(/No transactions were found/i);
  });
});
