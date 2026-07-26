import { prisma } from "@/lib/db/client";
import { convertMinor } from "@/lib/money/fx";

/**
 * Monthly time series for the dashboard charts: cash position (cumulative,
 * all transactions net to the true aggregate since internal transfers cancel)
 * and external credits vs debits (internal transfers excluded). All amounts
 * are converted to the org's base currency first. The bucketing is pure and
 * unit-tested.
 */

export type TimeRow = {
  date: Date;
  amountBaseMinor: bigint;
  isInternalTransfer: boolean;
};

export type MonthBucket = {
  key: string; // YYYY-MM
  label: string; // "Jun 2026"
  creditsMinor: bigint;
  debitsMinor: bigint; // positive magnitude
  cashMinor: bigint; // cumulative aggregate cash
};

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function buildTimeseries(
  rows: TimeRow[],
  openingTotalMinor: bigint,
): MonthBucket[] {
  const sorted = [...rows].sort((a, b) => a.date.getTime() - b.date.getTime());
  const byMonth = new Map<
    string,
    { credits: bigint; debits: bigint; net: bigint }
  >();
  const order: string[] = [];

  for (const r of sorted) {
    const key = `${r.date.getUTCFullYear()}-${String(
      r.date.getUTCMonth() + 1,
    ).padStart(2, "0")}`;
    let bucket = byMonth.get(key);
    if (!bucket) {
      bucket = { credits: 0n, debits: 0n, net: 0n };
      byMonth.set(key, bucket);
      order.push(key);
    }
    bucket.net += r.amountBaseMinor;
    if (!r.isInternalTransfer) {
      if (r.amountBaseMinor >= 0n) bucket.credits += r.amountBaseMinor;
      else bucket.debits += -r.amountBaseMinor;
    }
  }

  let running = openingTotalMinor;
  return order.map((key) => {
    const b = byMonth.get(key)!;
    running += b.net;
    return {
      key,
      label: monthLabel(key),
      creditsMinor: b.credits,
      debitsMinor: b.debits,
      cashMinor: running,
    };
  });
}

export async function getDashboardTimeseries(
  organizationId: string,
  base: string,
): Promise<MonthBucket[]> {
  const [accounts, txns] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { organizationId },
      select: { openingBalance: true, currency: true },
    }),
    prisma.transaction.findMany({
      where: { organizationId },
      select: {
        date: true,
        amount: true,
        currency: true,
        isInternalTransfer: true,
      },
      orderBy: { date: "asc" },
    }),
  ]);

  let openingTotal = 0n;
  for (const a of accounts) {
    const converted = convertMinor(a.openingBalance, a.currency, base);
    if (converted != null) openingTotal += converted;
  }

  const rows: TimeRow[] = [];
  for (const t of txns) {
    const converted = convertMinor(t.amount, t.currency, base);
    if (converted == null) continue;
    rows.push({
      date: t.date,
      amountBaseMinor: converted,
      isInternalTransfer: t.isInternalTransfer,
    });
  }

  return buildTimeseries(rows, openingTotal);
}
