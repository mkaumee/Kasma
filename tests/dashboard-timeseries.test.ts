import { describe, expect, test } from "vitest";

import { buildTimeseries, type TimeRow } from "@/lib/dashboard/timeseries";

function row(
  y: number,
  m: number,
  amountBaseMinor: bigint,
  isInternalTransfer = false,
): TimeRow {
  return { date: new Date(Date.UTC(y, m - 1, 15)), amountBaseMinor, isInternalTransfer };
}

describe("buildTimeseries", () => {
  test("buckets by month with cumulative cash from the opening total", () => {
    const buckets = buildTimeseries(
      [
        row(2026, 6, 50000n), // +500
        row(2026, 6, -20000n), // -200
        row(2026, 7, 100000n), // +1000
      ],
      100000n, // opening 1,000
    );
    expect(buckets).toHaveLength(2);
    expect(buckets[0]!.key).toBe("2026-06");
    expect(buckets[0]!.creditsMinor).toBe(50000n);
    expect(buckets[0]!.debitsMinor).toBe(20000n);
    expect(buckets[0]!.cashMinor).toBe(130000n); // 100000 + 500 - 200
    expect(buckets[1]!.cashMinor).toBe(230000n); // + 1000
  });

  test("internal transfers count toward cash but not credits/debits", () => {
    const buckets = buildTimeseries(
      [
        row(2026, 6, -50000n, true), // transfer out
        row(2026, 6, 50000n, true), // transfer in
        row(2026, 6, 30000n, false), // real inflow
      ],
      0n,
    );
    expect(buckets[0]!.creditsMinor).toBe(30000n); // transfers excluded
    expect(buckets[0]!.debitsMinor).toBe(0n);
    expect(buckets[0]!.cashMinor).toBe(30000n); // transfers net to zero
  });
});
