/**
 * Date parsing for statement extraction. Bank statements use wildly different
 * formats; this normalizes them to a UTC `Date` at midnight. Numeric
 * day/month order is genuinely ambiguous (01/02/2026), so callers pass the
 * expected {@link DateOrder}; it only matters when both parts are ≤ 12.
 */

export type DateOrder = "DMY" | "MDY";

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/** Expand a 2-digit year with the common 1970 pivot; pass 4-digit through. */
function expandYear(y: number): number {
  if (y >= 100) return y;
  return y <= 69 ? 2000 + y : 1900 + y;
}

/** Build a UTC date, returning null if the calendar rejects the components. */
function makeDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null; // e.g. 2026-02-31 rolled over
  }
  return d;
}

function parseTextualMonth(input: string): Date | null {
  const cleaned = input.trim();

  // "1 Jun 2026" / "01 June 2026"
  let m = cleaned.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[2]!.toLowerCase().slice(0, 4)] ?? MONTHS[m[2]!.toLowerCase().slice(0, 3)];
    if (month) return makeDate(expandYear(Number(m[3])), month, Number(m[1]));
  }

  // "Jun 1, 2026" / "June 1 2026"
  m = cleaned.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})\.?,?\s+(\d{2,4})$/);
  if (m) {
    const month = MONTHS[m[1]!.toLowerCase().slice(0, 4)] ?? MONTHS[m[1]!.toLowerCase().slice(0, 3)];
    if (month) return makeDate(expandYear(Number(m[3])), month, Number(m[2]));
  }

  return null;
}

function parseNumeric(input: string, order: DateOrder): Date | null {
  const parts = input.trim().split(/[/.\-\s]+/);
  if (parts.length !== 3) return null;
  if (parts.some((p) => !/^\d{1,4}$/.test(p))) return null;
  const [a, b, c] = parts.map(Number) as [number, number, number];

  // ISO-ish: leading 4-digit year → Y M D.
  if (parts[0]!.length === 4) return makeDate(a, b, c);

  // Otherwise the year is last (2- or 4-digit); a and b are day/month.
  const year = expandYear(c);
  let day: number;
  let month: number;
  if (a > 12 && b <= 12) {
    day = a;
    month = b;
  } else if (b > 12 && a <= 12) {
    month = a;
    day = b;
  } else {
    // Both ≤ 12 (or both invalid): fall back to the declared order.
    if (order === "MDY") {
      month = a;
      day = b;
    } else {
      day = a;
      month = b;
    }
  }
  return makeDate(year, month, day);
}

/**
 * Parse a statement date string into a UTC Date, or null if unrecognized.
 * @param order how to read ambiguous numeric dates (default day-first).
 */
export function parseStatementDate(
  input: string | null | undefined,
  order: DateOrder = "DMY",
): Date | null {
  if (input == null) return null;
  const text = String(input).trim();
  if (text === "") return null;

  // Drop a time component if present (ISO or space-separated).
  const dateOnly = text.split(/[T ]/)[0]!.trim() || text;

  if (/^\d{4}[/.-]\d{1,2}[/.-]\d{1,2}$/.test(dateOnly)) {
    return parseNumeric(dateOnly, order);
  }
  if (/^\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(dateOnly)) {
    return parseNumeric(dateOnly, order);
  }
  return parseTextualMonth(text);
}
