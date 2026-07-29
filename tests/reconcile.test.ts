import { describe, expect, test } from "vitest";

import {
  reconcileStatement,
  type ReconcileTransaction,
} from "@/lib/statements/reconcile";

function txn(
  amount: bigint,
  runningBalance: bigint | null,
  direction: "CREDIT" | "DEBIT" = amount < 0n ? "DEBIT" : "CREDIT",
): ReconcileTransaction {
  return {
    date: new Date(Date.UTC(2026, 5, 1)),
    valueDate: null,
    description: "Row",
    rawDescription: "Row",
    amount,
    direction,
    type: direction === "CREDIT" ? "CREDIT" : "DEBIT",
    runningBalance,
    currency: "USD",
    counterparty: null,
    reference: null,
  };
}

const statement = {
  currency: "USD",
  openingBalance: 100000n,
  closingBalance: 249550n,
  // Read off the statement, not derived from the rows.
  openingBalanceInferred: false,
  closingBalanceInferred: false,
  periodStart: null,
  periodEnd: null,
};

describe("reconcileStatement", () => {
  test("maps persisted rows and confirms a reconciling statement", () => {
    const v = reconcileStatement(statement, [
      txn(-450n, 99550n),
      txn(200000n, 299550n),
      txn(-50000n, 249550n),
    ]);
    expect(v.ok).toBe(true);
    expect(v.breaks).toHaveLength(0);
    expect(v.closingOk).toBe(true);
  });

  test("surfaces a break from an inconsistent running balance", () => {
    const v = reconcileStatement(
      { ...statement, closingBalance: 199550n },
      [txn(-450n, 99550n), txn(200000n, 299550n), txn(-50000n, 199550n)],
    );
    expect(v.ok).toBe(false);
    expect(v.breaks[0]!.index).toBe(2);
    expect(v.breaks[0]!.gap).toBe(-50000n);
  });
});
