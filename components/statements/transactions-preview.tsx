import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/money/currency";

export type PreviewTransaction = {
  id: string;
  /** ISO date string. */
  date: string;
  description: string;
  /** Signed minor-unit amount as a string. */
  amount: string;
  direction: "CREDIT" | "DEBIT";
  /** Signed minor-unit running balance as a string, or null. */
  runningBalance: string | null;
};

/** Read-only table of a statement's extracted transactions. */
export function TransactionsPreview({
  currency,
  transactions,
}: {
  currency: string;
  transactions: PreviewTransaction[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-6 py-2 font-medium">Date</th>
            <th className="px-6 py-2 font-medium">Description</th>
            <th className="px-6 py-2 text-right font-medium">Amount</th>
            <th className="px-6 py-2 text-right font-medium">Balance</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {transactions.map((t) => (
            <tr key={t.id} className="hover:bg-muted/40">
              <td className="whitespace-nowrap px-6 py-2 tabular-nums text-muted-foreground">
                {new Date(t.date).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </td>
              <td className="max-w-0 px-6 py-2">
                <span className="block truncate">{t.description}</span>
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-6 py-2 text-right font-medium tabular-nums",
                  t.direction === "CREDIT" ? "text-credit" : "text-debit",
                )}
              >
                {formatMoney(BigInt(t.amount), currency, {
                  signDisplay: "always",
                })}
              </td>
              <td className="whitespace-nowrap px-6 py-2 text-right tabular-nums text-muted-foreground">
                {t.runningBalance != null
                  ? formatMoney(BigInt(t.runningBalance), currency)
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
