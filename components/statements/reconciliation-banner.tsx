import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money/currency";

export type ReconciliationSummary = {
  ok: boolean;
  hasBalances: boolean;
  closingOk: boolean | null;
  /** Signed minor-unit string, or null. */
  closingDelta: string | null;
  breaks: { index: number; gap: string }[];
};

/**
 * Banner summarizing whether a statement's transactions reconcile against its
 * running balance — the product's core "no bank API" trust signal.
 */
export function ReconciliationBanner({
  currency,
  summary,
}: {
  currency: string;
  summary: ReconciliationSummary;
}) {
  const nothingToCheck =
    !summary.hasBalances && summary.closingOk === null;

  const tone = summary.ok
    ? "ok"
    : nothingToCheck
      ? "unknown"
      : "warn";

  const { icon: Icon, title, detail } = describe(summary, currency, tone);

  return (
    <div
      className={cn(
        "flex items-start gap-3 border-b px-6 py-3 text-sm",
        tone === "ok" && "bg-success/10 text-success-foreground",
        tone === "warn" && "bg-warning/10 text-warning-foreground",
        tone === "unknown" && "bg-muted text-muted-foreground",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "ok" && "text-success",
          tone === "warn" && "text-warning",
        )}
        aria-hidden
      />
      <div>
        <p className="font-medium">{title}</p>
        {detail && <p className="text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}

function describe(
  summary: ReconciliationSummary,
  currency: string,
  tone: "ok" | "warn" | "unknown",
): { icon: typeof CheckCircle2; title: string; detail: string | null } {
  if (tone === "ok") {
    return {
      icon: CheckCircle2,
      title: "Balance reconciles",
      detail:
        "Opening balance plus every transaction matches the statement's closing balance.",
    };
  }
  if (tone === "unknown") {
    return {
      icon: HelpCircle,
      title: "No running balance to verify against",
      detail:
        "This statement carries no opening/closing balance, so extraction can't be cross-checked automatically. Review the rows below.",
    };
  }

  const parts: string[] = [];
  if (summary.breaks.length > 0) {
    const first = summary.breaks[0]!;
    parts.push(
      `${summary.breaks.length} balance ${
        summary.breaks.length === 1 ? "break" : "breaks"
      } — first is a ${formatMoney(BigInt(first.gap), currency, {
        signDisplay: "always",
      })} gap at row ${first.index + 1}.`,
    );
  }
  if (summary.closingOk === false && summary.closingDelta != null) {
    parts.push(
      `Computed closing is off by ${formatMoney(
        BigInt(summary.closingDelta),
        currency,
        { signDisplay: "always" },
      )}.`,
    );
  }
  return {
    icon: AlertTriangle,
    title: "Balance doesn't reconcile",
    detail: parts.join(" ") || "A row may be missing or mis-parsed.",
  };
}
