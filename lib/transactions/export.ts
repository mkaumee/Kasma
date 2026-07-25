import { minorToDecimalString } from "@/lib/money/currency";

/** Column headers for a transactions export. */
export const EXPORT_HEADERS = [
  "Date",
  "Account",
  "Description",
  "Counterparty",
  "Category",
  "Type",
  "Direction",
  "Amount",
  "Currency",
  "Balance",
  "Reference",
  "Verification",
];

export type ExportTransaction = {
  date: Date;
  description: string;
  counterparty: string | null;
  amount: bigint;
  direction: string;
  type: string;
  currency: string;
  runningBalance: bigint | null;
  reference: string | null;
  verificationStatus: string;
  bankAccount: { bankName: string; accountName: string };
  category: { name: string } | null;
};

/** Map a transaction to an ordered row of string cells. */
export function transactionToRow(t: ExportTransaction): string[] {
  return [
    t.date.toISOString().slice(0, 10),
    `${t.bankAccount.bankName} · ${t.bankAccount.accountName}`,
    t.description,
    t.counterparty ?? "",
    t.category?.name ?? "",
    t.type,
    t.direction,
    minorToDecimalString(t.amount, t.currency),
    t.currency,
    t.runningBalance != null
      ? minorToDecimalString(t.runningBalance, t.currency)
      : "",
    t.reference ?? "",
    t.verificationStatus,
  ];
}

function escapeCell(value: string): string {
  return /["\r\n,]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Render headers + rows as RFC-4180 CSV (CRLF line endings). */
export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((row) => row.map(escapeCell).join(","))
    .join("\r\n");
}
