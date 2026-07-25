import { describe, expect, test } from "vitest";

import {
  EXPORT_HEADERS,
  toCsv,
  transactionToRow,
  type ExportTransaction,
} from "@/lib/transactions/export";

const txn: ExportTransaction = {
  date: new Date(Date.UTC(2026, 5, 1)),
  description: 'Acme, "Inc"',
  counterparty: null,
  amount: -450n,
  direction: "DEBIT",
  type: "CHARGE",
  currency: "USD",
  runningBalance: 99550n,
  reference: null,
  verificationStatus: "UNVERIFIED",
  bankAccount: { bankName: "Chase", accountName: "Operating" },
  category: { name: "Food" },
};

describe("transaction export", () => {
  test("maps a transaction to ordered cells", () => {
    const row = transactionToRow(txn);
    expect(row).toEqual([
      "2026-06-01",
      "Chase · Operating",
      'Acme, "Inc"',
      "",
      "Food",
      "CHARGE",
      "DEBIT",
      "-4.50",
      "USD",
      "995.50",
      "",
      "UNVERIFIED",
    ]);
  });

  test("scales JPY (zero-decimal) amounts", () => {
    const row = transactionToRow({
      ...txn,
      currency: "JPY",
      amount: 1500n,
      runningBalance: null,
    });
    expect(row[7]).toBe("1500");
    expect(row[9]).toBe("");
  });

  test("CSV quotes cells containing commas, quotes, or newlines", () => {
    const csv = toCsv(EXPORT_HEADERS, [transactionToRow(txn)]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toBe(EXPORT_HEADERS.join(","));
    // Description with comma + quotes is wrapped and quotes doubled.
    expect(lines[1]).toContain('"Acme, ""Inc"""');
  });
});
