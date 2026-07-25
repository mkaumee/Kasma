import { currencyDecimals } from "@/lib/money/currency";

/**
 * Indicative FX rates expressed as units of currency per 1 USD.
 *
 * These are static placeholder values so cross-currency totals are meaningful
 * in development. Replace with a live rate feed (stored per-day) before relying
 * on totals for anything financial.
 */
export const USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.52,
  AED: 3.67,
  NGN: 1550,
  KES: 129,
  ZAR: 18.4,
  INR: 83.3,
  JPY: 151,
};

/** Rate to multiply a `from` amount by to get a `to` amount, or null. */
export function fxRate(from: string, to: string): number | null {
  const f = USD_RATES[from];
  const t = USD_RATES[to];
  if (f == null || t == null) return null;
  return t / f;
}

/**
 * Convert minor units from one currency to another, returning minor units in
 * `to`. Uses float math on the major value (indicative only). Returns null if
 * either currency is unknown.
 */
export function convertMinor(
  minor: bigint,
  from: string,
  to: string,
): bigint | null {
  if (from === to) return minor;
  const rate = fxRate(from, to);
  if (rate == null) return null;

  const fromMajor = Number(minor) / 10 ** currencyDecimals(from);
  const toMajor = fromMajor * rate;
  return BigInt(Math.round(toMajor * 10 ** currencyDecimals(to)));
}

/**
 * Total a set of balances into a base currency. Balances in unknown currencies
 * are skipped and flagged via `hasUnconvertible`.
 */
export function totalInBaseCurrency(
  balances: { currentBalance: bigint; currency: string }[],
  base: string,
): { total: bigint; hasUnconvertible: boolean } {
  let total = 0n;
  let hasUnconvertible = false;
  for (const b of balances) {
    const converted = convertMinor(b.currentBalance, b.currency, base);
    if (converted == null) hasUnconvertible = true;
    else total += converted;
  }
  return { total, hasUnconvertible };
}
