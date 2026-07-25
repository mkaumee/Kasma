import { describe, expect, test } from "vitest";

import { alertDetailLine } from "@/lib/alerts/display";

describe("alertDetailLine", () => {
  test("balance mismatch shows the absolute delta", () => {
    expect(
      alertDetailLine("BALANCE_MISMATCH", { delta: "-49550", currency: "USD" }),
    ).toBe("Computed closing is off by $495.50.");
  });

  test("missing transaction summarizes gaps", () => {
    expect(
      alertDetailLine("MISSING_TRANSACTION", {
        currency: "USD",
        breaks: [{ index: 2, gap: "-50000" }, { index: 4, gap: "1000" }],
      }),
    ).toBe("2 unexplained gaps, first $500.00.");
  });

  test("anomaly shows amount, average, and z", () => {
    expect(
      alertDetailLine("ANOMALY", {
        amount: "-100000",
        mean: "-1000",
        z: "-4.47",
        currency: "USD",
      }),
    ).toBe("Amount -$1,000.00 vs average -$10.00 (z=-4.47).");
  });

  test("unusual activity explains the reason", () => {
    expect(
      alertDetailLine("UNUSUAL_ACTIVITY", {
        amount: "-500000",
        reason: "round-sum",
        currency: "USD",
      }),
    ).toBe("Large round amount — -$5,000.00.");
  });

  test("returns null for empty detail", () => {
    expect(alertDetailLine("ANOMALY", null)).toBeNull();
  });
});
