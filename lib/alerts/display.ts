import type { AlertSeverity, AlertType } from "@prisma/client";

import { formatMoney } from "@/lib/money/currency";

export const ALERT_TYPE_LABEL: Record<AlertType, string> = {
  BALANCE_MISMATCH: "Balance mismatch",
  MISSING_TRANSACTION: "Missing transaction",
  MISSING_STATEMENT: "Missing statement",
  DUPLICATE: "Duplicate",
  ANOMALY: "Anomaly",
  UNUSUAL_ACTIVITY: "Unusual activity",
};

export const SEVERITY_RANK: Record<AlertSeverity, number> = {
  CRITICAL: 3,
  HIGH: 2,
  MEDIUM: 1,
  LOW: 0,
};

export const SEVERITY_VARIANT: Record<
  AlertSeverity,
  "destructive" | "warning" | "secondary"
> = {
  CRITICAL: "destructive",
  HIGH: "destructive",
  MEDIUM: "warning",
  LOW: "secondary",
};

export const SEVERITY_LABEL: Record<AlertSeverity, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

const absStr = (v: string): bigint => {
  const n = BigInt(v);
  return n < 0n ? -n : n;
};

/** A human one-liner describing an alert's detail payload. */
export function alertDetailLine(type: AlertType, detail: unknown): string | null {
  if (!detail || typeof detail !== "object") return null;
  const d = detail as Record<string, unknown>;
  const currency = typeof d.currency === "string" ? d.currency : "USD";
  const money = (v: unknown) =>
    typeof v === "string" ? formatMoney(BigInt(v), currency) : null;
  const absMoney = (v: unknown) =>
    typeof v === "string" ? formatMoney(absStr(v), currency) : null;

  switch (type) {
    case "BALANCE_MISMATCH": {
      const m = absMoney(d.delta);
      return m ? `Computed closing is off by ${m}.` : null;
    }
    case "MISSING_STATEMENT": {
      const m = absMoney(d.delta);
      return m ? `Balances don't carry over — a gap of ${m}.` : null;
    }
    case "MISSING_TRANSACTION": {
      const breaks = Array.isArray(d.breaks) ? d.breaks : [];
      const first = breaks[0] as { gap?: string } | undefined;
      const m = first?.gap ? absMoney(first.gap) : null;
      return `${breaks.length} unexplained gap${
        breaks.length === 1 ? "" : "s"
      }${m ? `, first ${m}` : ""}.`;
    }
    case "ANOMALY": {
      const a = money(d.amount);
      const avg = money(d.mean);
      const z = typeof d.z === "string" ? d.z : null;
      return a
        ? `Amount ${a}${avg ? ` vs average ${avg}` : ""}${z ? ` (z=${z})` : ""}.`
        : null;
    }
    case "UNUSUAL_ACTIVITY": {
      const a = money(d.amount);
      const reason =
        d.reason === "round-sum"
          ? "Large round amount"
          : d.reason === "first-seen"
            ? "First transaction with this counterparty"
            : "Unusual";
      return a ? `${reason} — ${a}.` : null;
    }
    default:
      return null;
  }
}
