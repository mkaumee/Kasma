import { describe, expect, test } from "vitest";

import { dedupeHash, flagDuplicates } from "@/lib/extraction/dedupe";

const base = {
  bankAccountId: "acct_1",
  date: new Date(Date.UTC(2026, 5, 1)),
  amount: -450n,
  description: "Coffee Shop",
};

describe("dedupeHash", () => {
  test("is deterministic for identical input", () => {
    expect(dedupeHash(base)).toBe(dedupeHash({ ...base }));
  });

  test("ignores punctuation/case/whitespace in description and reference", () => {
    expect(dedupeHash({ ...base, description: "COFFEE  shop!" })).toBe(
      dedupeHash({ ...base, description: "Coffee Shop" }),
    );
    expect(dedupeHash({ ...base, reference: "REF-001" })).toBe(
      dedupeHash({ ...base, reference: "ref 001" }),
    );
  });

  test("changes when account, date, amount, or reference differ", () => {
    const h = dedupeHash(base);
    expect(dedupeHash({ ...base, bankAccountId: "acct_2" })).not.toBe(h);
    expect(dedupeHash({ ...base, amount: -451n })).not.toBe(h);
    expect(
      dedupeHash({ ...base, date: new Date(Date.UTC(2026, 5, 2)) }),
    ).not.toBe(h);
    expect(dedupeHash({ ...base, reference: "X" })).not.toBe(h);
  });

  test("sign matters: a debit and a credit of the same size differ", () => {
    expect(dedupeHash({ ...base, amount: 450n })).not.toBe(
      dedupeHash({ ...base, amount: -450n }),
    );
  });
});

describe("flagDuplicates", () => {
  test("flags within-batch repeats after the first occurrence", () => {
    const flags = flagDuplicates(["a", "b", "a", "c", "b"]);
    expect(flags.map((f) => f.isDuplicate)).toEqual([
      false,
      false,
      true,
      false,
      true,
    ]);
    expect(flags[2]!.reason).toBe("batch");
  });

  test("flags hashes already persisted for the org", () => {
    const flags = flagDuplicates(["a", "b"], new Set(["a"]));
    expect(flags[0]).toMatchObject({ isDuplicate: true, reason: "existing" });
    expect(flags[1]).toMatchObject({ isDuplicate: false, reason: null });
  });
});
