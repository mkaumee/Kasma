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
  /** Whether the statement has an opening / closing figure at all. */
  hasOpening?: boolean;
  hasClosing?: boolean;
  /**
   * Both figures were derived from the rows, so `opening + Σamounts == closing`
   * holds by construction and proves nothing (see validate.ts).
   */
  derivedOnly?: boolean;
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
    // Be specific about *why* nothing could be checked — the old copy claimed
    // "no opening/closing balance" even when one of the two was present and
    // displayed right above this banner.
    if (summary.derivedOnly) {
      return {
        icon: HelpCircle,
        title: "Balances were derived from the rows",
        detail:
          "This statement prints no opening or closing balance, so both were computed from the transactions themselves — they can't independently confirm the extraction. Review the rows below.",
      };
    }
    const hasOpening = summary.hasOpening ?? false;
    const hasClosing = summary.hasClosing ?? false;
    if (hasOpening !== hasClosing) {
      const present = hasOpening ? "opening" : "closing";
      const missing = hasOpening ? "closing" : "opening";
      return {
        icon: HelpCircle,
        title: `No ${missing} balance to verify against`,
        detail: `This statement has an ${present} balance but no ${missing} one, so the totals can't be cross-checked automatically. Add it above, or review the rows below.`,
      };
    }
    return {
      icon: HelpCircle,
      title: "No running balance to verify against",
      detail:
        "This statement carries no opening or closing balance, so extraction can't be cross-checked automatically. Add them above if you have the statement to hand, or review the rows below.",
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
