import { describe, expect, test } from "vitest";

import { parseStatementDate } from "@/lib/extraction/dates";

function iso(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

describe("parseStatementDate", () => {
  test("parses ISO dates and strips time", () => {
    expect(iso(parseStatementDate("2026-06-01"))).toBe("2026-06-01");
    expect(iso(parseStatementDate("2026/06/01"))).toBe("2026-06-01");
    expect(iso(parseStatementDate("2026-06-01T10:30:00Z"))).toBe("2026-06-01");
  });

  test("uses the >12 heuristic to disambiguate day/month", () => {
    expect(iso(parseStatementDate("15/06/2026"))).toBe("2026-06-15"); // day first
    expect(iso(parseStatementDate("06/15/2026"))).toBe("2026-06-15"); // month first
  });

  test("respects the declared order when ambiguous", () => {
    expect(iso(parseStatementDate("01/02/2026", "DMY"))).toBe("2026-02-01");
    expect(iso(parseStatementDate("01/02/2026", "MDY"))).toBe("2026-01-02");
  });

  test("expands 2-digit years", () => {
    expect(iso(parseStatementDate("01/06/26"))).toBe("2026-06-01");
  });

  test("parses textual months in both orders", () => {
    expect(iso(parseStatementDate("1 Jun 2026"))).toBe("2026-06-01");
    expect(iso(parseStatementDate("01 June 2026"))).toBe("2026-06-01");
    expect(iso(parseStatementDate("Jun 1, 2026"))).toBe("2026-06-01");
    expect(iso(parseStatementDate("September 30 2026"))).toBe("2026-09-30");
  });

  test("rejects invalid calendar dates and junk", () => {
    expect(parseStatementDate("2026-02-31")).toBeNull();
    expect(parseStatementDate("not a date")).toBeNull();
    expect(parseStatementDate("")).toBeNull();
    expect(parseStatementDate(null)).toBeNull();
  });
});
