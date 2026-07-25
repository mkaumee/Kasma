export type ColumnField =
  | "date"
  | "valueDate"
  | "description"
  | "amount"
  | "debit"
  | "credit"
  | "balance"
  | "reference"
  | "counterparty";

export type ColumnMap = Partial<Record<ColumnField, number>>;

// Ordered so more specific fields win (valueDate before date, debit/credit
// before amount). First matching pattern claims a header.
const PATTERNS: [ColumnField, RegExp][] = [
  ["valueDate", /valuedate/],
  ["date", /date|posted|posting/],
  ["debit", /debit|withdrawal|withdrawl|moneyout|paidout|outflow|^dr$/],
  ["credit", /credit|deposit|moneyin|paidin|inflow|^cr$/],
  ["amount", /amount/],
  [
    "description",
    /description|details|narration|memo|payee|particular|narrative|transaction/,
  ],
  ["balance", /balance/],
  ["reference", /reference|^ref$|cheque|check/],
  ["counterparty", /counterparty|beneficiary/],
];

function normalize(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map a header row's columns to canonical transaction fields. */
export function mapColumns(headers: (string | null | undefined)[]): ColumnMap {
  const map: ColumnMap = {};
  headers.forEach((header, index) => {
    const key = normalize(header ?? "");
    if (!key) return;
    for (const [field, pattern] of PATTERNS) {
      if (map[field] !== undefined) continue;
      if (pattern.test(key)) {
        map[field] = index;
        break;
      }
    }
  });
  return map;
}

/** A usable statement needs a date and some amount signal. */
export function hasEssentialColumns(map: ColumnMap): boolean {
  const hasDate = map.date !== undefined || map.valueDate !== undefined;
  const hasAmount =
    map.amount !== undefined ||
    map.debit !== undefined ||
    map.credit !== undefined;
  return hasDate && hasAmount;
}
