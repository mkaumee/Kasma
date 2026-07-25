// Currency metadata + money formatting/parsing.
//
// Money is stored as integer minor units (e.g. cents). These helpers convert
// between minor units (bigint) and human-readable strings without floats
// where precision matters (parsing), and via Intl for display.

export type CurrencyCode =
  | "USD"
  | "EUR"
  | "GBP"
  | "CAD"
  | "AUD"
  | "AED"
  | "NGN"
  | "KES"
  | "ZAR"
  | "INR"
  | "JPY";

export type CurrencyMeta = {
  code: CurrencyCode;
  name: string;
  decimals: number;
};

export const CURRENCIES: Record<CurrencyCode, CurrencyMeta> = {
  USD: { code: "USD", name: "US Dollar", decimals: 2 },
  EUR: { code: "EUR", name: "Euro", decimals: 2 },
  GBP: { code: "GBP", name: "British Pound", decimals: 2 },
  CAD: { code: "CAD", name: "Canadian Dollar", decimals: 2 },
  AUD: { code: "AUD", name: "Australian Dollar", decimals: 2 },
  AED: { code: "AED", name: "UAE Dirham", decimals: 2 },
  NGN: { code: "NGN", name: "Nigerian Naira", decimals: 2 },
  KES: { code: "KES", name: "Kenyan Shilling", decimals: 2 },
  ZAR: { code: "ZAR", name: "South African Rand", decimals: 2 },
  INR: { code: "INR", name: "Indian Rupee", decimals: 2 },
  JPY: { code: "JPY", name: "Japanese Yen", decimals: 0 },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function currencyDecimals(code: string): number {
  return isCurrencyCode(code) ? CURRENCIES[code].decimals : 2;
}

/** Format minor units as a localized currency string. */
export function formatMoney(
  minorUnits: bigint | number,
  code: string,
  opts: { locale?: string; signDisplay?: "auto" | "always" | "never" } = {},
): string {
  const decimals = currencyDecimals(code);
  const minor =
    typeof minorUnits === "bigint" ? Number(minorUnits) : minorUnits;
  const value = minor / 10 ** decimals;

  return new Intl.NumberFormat(opts.locale ?? "en-US", {
    style: "currency",
    currency: isCurrencyCode(code) ? code : "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: opts.signDisplay ?? "auto",
  }).format(value);
}

/**
 * Parse a decimal string ("1,234.56") into integer minor units for `code`.
 * Returns null for invalid input. Uses bigint so it is exact.
 */
export function parseMoney(input: string, code: string): bigint | null {
  const decimals = currencyDecimals(code);
  const cleaned = input.replace(/[,\s]/g, "").trim();
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  if (!/^-?\d*(\.\d*)?$/.test(cleaned)) return null;

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [wholeStr = "0", fracStr = ""] = unsigned.split(".");
  if (fracStr.length > decimals && /[1-9]/.test(fracStr.slice(decimals))) {
    // More precision than the currency supports and it's significant.
    return null;
  }
  const fracPadded = (fracStr + "0".repeat(decimals)).slice(0, decimals);
  const scale = 10n ** BigInt(decimals);
  const minor = BigInt(wholeStr || "0") * scale + BigInt(fracPadded || "0");
  return negative ? -minor : minor;
}

/** Convert minor units into a plain decimal string ("1234.56") for form inputs. */
export function minorToDecimalString(minorUnits: bigint, code: string): string {
  const decimals = currencyDecimals(code);
  const negative = minorUnits < 0n;
  const abs = negative ? -minorUnits : minorUnits;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  const frac = abs % scale;
  const fracStr =
    decimals > 0 ? `.${frac.toString().padStart(decimals, "0")}` : "";
  return `${negative ? "-" : ""}${whole}${fracStr}`;
}
