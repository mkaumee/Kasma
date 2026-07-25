import { describe, expect, test } from "vitest";

import { redactAccountNumbers } from "@/lib/extraction/claude";

describe("redactAccountNumbers (PII guardrail)", () => {
  test("masks a 16-digit card number, keeping the last 4", () => {
    const out = redactAccountNumbers("Card 4111 1111 1111 1234 charged");
    expect(out).toContain("1234");
    expect(out).not.toContain("4111 1111 1111 1234");
    expect(out).toMatch(/\*{12}1234/);
  });

  test("masks a long account number joined by dashes", () => {
    expect(redactAccountNumbers("Acct 1234-5678-9012-3456")).toMatch(
      /\*{12}3456/,
    );
  });

  test("leaves dates untouched", () => {
    const text = "2026-06-01 payment on 2026/12/31";
    expect(redactAccountNumbers(text)).toBe(text);
  });

  test("leaves money amounts and short references untouched", () => {
    const text = "Amount 1,234,567.89 ref 12345678";
    expect(redactAccountNumbers(text)).toBe(text);
  });
});
