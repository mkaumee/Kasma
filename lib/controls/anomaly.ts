import {
  autoResolveAlert,
  severityForAmount,
  upsertAlert,
} from "@/lib/controls/alerts";
import { prisma } from "@/lib/db/client";
import { currencyDecimals } from "@/lib/money/currency";

/**
 * Anomaly detection (Feature 5). Two families of signal:
 *  - statistical outliers: a transaction whose amount is a z-score outlier
 *    versus that counterparty's history (needs enough history) → ANOMALY.
 *  - rule flags: large round sums and first-seen counterparties with a large
 *    amount → UNUSUAL_ACTIVITY.
 * The pure helpers are exported for testing.
 */

export const Z_THRESHOLD = 3;
export const MIN_HISTORY = 5;

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function stddev(values: number[], m = mean(values)): number {
  if (values.length === 0) return 0;
  const variance =
    values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function zScore(value: number, m: number, sd: number): number {
  return sd === 0 ? 0 : (value - m) / sd;
}

/** A large, suspiciously round amount (≥ 1,000 major units, whole thousands). */
export function isLargeRoundSum(minor: bigint, decimals: number): boolean {
  const abs = minor < 0n ? -minor : minor;
  const unit = 1000n * 10n ** BigInt(decimals);
  return abs >= unit && abs % unit === 0n;
}

const abs = (v: bigint) => (v < 0n ? -v : v);

type Row = {
  id: string;
  counterparty: string | null;
  amount: bigint;
  currency: string;
  bankAccountId: string;
};

export async function detectAnomalies(
  organizationId: string,
): Promise<{ raised: number }> {
  const txns: Row[] = await prisma.transaction.findMany({
    where: { organizationId, isInternalTransfer: false },
    select: {
      id: true,
      counterparty: true,
      amount: true,
      currency: true,
      bankAccountId: true,
    },
  });

  const groups = new Map<string, Row[]>();
  for (const t of txns) {
    const key = (t.counterparty ?? "").toLowerCase().trim();
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(t);
    groups.set(key, list);
  }

  const flaggedAnomaly = new Set<string>();
  const flaggedUnusual = new Set<string>();
  let raised = 0;

  // Statistical outliers per counterparty.
  for (const list of groups.values()) {
    if (list.length < MIN_HISTORY) continue;
    const values = list.map((t) => Number(t.amount));
    const m = mean(values);
    const sd = stddev(values, m);
    if (sd === 0) continue;
    for (const t of list) {
      const z = zScore(Number(t.amount), m, sd);
      if (Math.abs(z) <= Z_THRESHOLD) continue;
      flaggedAnomaly.add(t.id);
      await upsertAlert({
        organizationId,
        type: "ANOMALY",
        severity: severityForAmount(t.amount),
        title: `Unusual amount for “${t.counterparty}”`,
        detail: {
          amount: t.amount.toString(),
          mean: Math.round(m).toString(),
          z: z.toFixed(2),
          currency: t.currency,
        },
        dedupeKey: `anomaly:${t.id}`,
        transactionId: t.id,
        bankAccountId: t.bankAccountId,
      });
      raised += 1;
    }
  }

  // Rule flags: large round sums + first-seen counterparty with a large amount.
  for (const t of txns) {
    if (!isLargeRoundSum(t.amount, currencyDecimals(t.currency))) continue;
    flaggedUnusual.add(t.id);
    await upsertAlert({
      organizationId,
      type: "UNUSUAL_ACTIVITY",
      severity: "MEDIUM",
      title: `Large round amount`,
      detail: { amount: t.amount.toString(), currency: t.currency, reason: "round-sum" },
      dedupeKey: `roundsum:${t.id}`,
      transactionId: t.id,
      bankAccountId: t.bankAccountId,
    });
    raised += 1;
  }

  for (const list of groups.values()) {
    if (list.length !== 1) continue;
    const t = list[0]!;
    const threshold = 1000n * 10n ** BigInt(currencyDecimals(t.currency));
    if (abs(t.amount) < threshold) continue;
    flaggedUnusual.add(t.id);
    await upsertAlert({
      organizationId,
      type: "UNUSUAL_ACTIVITY",
      severity: "MEDIUM",
      title: `First transaction with “${t.counterparty}”`,
      detail: { amount: t.amount.toString(), currency: t.currency, reason: "first-seen" },
      dedupeKey: `firstseen:${t.id}`,
      transactionId: t.id,
      bankAccountId: t.bankAccountId,
    });
    raised += 1;
  }

  // Auto-resolve anomaly/unusual alerts that no longer apply.
  const stale = await prisma.alert.findMany({
    where: {
      organizationId,
      type: { in: ["ANOMALY", "UNUSUAL_ACTIVITY"] },
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    select: { dedupeKey: true, type: true, transactionId: true },
  });
  for (const a of stale) {
    const stillFlagged =
      (a.type === "ANOMALY" && a.transactionId && flaggedAnomaly.has(a.transactionId)) ||
      (a.type === "UNUSUAL_ACTIVITY" && a.transactionId && flaggedUnusual.has(a.transactionId));
    if (!stillFlagged) await autoResolveAlert(organizationId, a.dedupeKey);
  }

  return { raised };
}
