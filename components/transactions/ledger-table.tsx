import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Paperclip,
} from "lucide-react";

import { formatMoney } from "@/lib/money/currency";
import type { LedgerPage, LedgerSort } from "@/lib/transactions/query";
import { buildLedgerHref, type LedgerQuery } from "@/lib/transactions/url";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const VERIFICATION_VARIANT = {
  VERIFIED: "success",
  DISPUTED: "destructive",
  UNVERIFIED: "secondary",
} as const;

function SortHeader({
  column,
  label,
  page,
  query,
  align = "left",
}: {
  column: LedgerSort;
  label: string;
  page: LedgerPage;
  query: LedgerQuery;
  align?: "left" | "right";
}) {
  const active = page.sort === column;
  const nextDir = active && page.dir === "desc" ? "asc" : "desc";
  const Icon = !active ? ChevronsUpDown : page.dir === "desc" ? ArrowDown : ArrowUp;
  return (
    <Link
      href={buildLedgerHref(query, { sort: column, dir: nextDir, page: 1 })}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        align === "right" && "flex-row-reverse",
        active && "text-foreground",
      )}
    >
      {label}
      <Icon className="size-3.5" aria-hidden />
    </Link>
  );
}

export function LedgerTable({
  page,
  query,
}: {
  page: LedgerPage;
  query: LedgerQuery;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="px-4 py-2.5 font-medium">
              <SortHeader column="date" label="Date" page={page} query={query} />
            </th>
            <th className="px-4 py-2.5 font-medium">Account</th>
            <th className="px-4 py-2.5 font-medium">
              <SortHeader
                column="description"
                label="Description"
                page={page}
                query={query}
              />
            </th>
            <th className="px-4 py-2.5 font-medium">Category</th>
            <th className="px-4 py-2.5 text-right font-medium">
              <SortHeader
                column="amount"
                label="Amount"
                page={page}
                query={query}
                align="right"
              />
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Balance</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {page.rows.map((t) => (
            <tr key={t.id} className="hover:bg-muted/40">
              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-muted-foreground">
                {t.date.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-muted-foreground">
                {t.bankAccount.bankName}
                <span className="text-muted-foreground/60">
                  {" · "}
                  {t.bankAccount.accountName}
                </span>
              </td>
              <td className="max-w-0 px-4 py-2.5">
                <Link
                  href={`/transactions/${t.id}`}
                  className="block truncate font-medium hover:underline"
                >
                  {t.description}
                </Link>
                {t.counterparty && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {t.counterparty}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                {t.category ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: t.category.color ?? "#a1a1aa" }}
                      aria-hidden
                    />
                    {t.category.name}
                  </span>
                ) : (
                  <span className="text-muted-foreground/50">—</span>
                )}
              </td>
              <td
                className={cn(
                  "whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums",
                  t.direction === "CREDIT" ? "text-credit" : "text-debit",
                )}
              >
                {formatMoney(t.amount, t.currency, { signDisplay: "always" })}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-muted-foreground">
                {t.runningBalance != null
                  ? formatMoney(t.runningBalance, t.currency)
                  : "—"}
              </td>
              <td className="whitespace-nowrap px-4 py-2.5">
                <span className="inline-flex items-center gap-2">
                  <Badge variant={VERIFICATION_VARIANT[t.verificationStatus]}>
                    {t.verificationStatus === "UNVERIFIED"
                      ? "Unverified"
                      : t.verificationStatus === "VERIFIED"
                        ? "Verified"
                        : "Disputed"}
                  </Badge>
                  {t._count.attachments > 0 && (
                    <span
                      className="inline-flex items-center gap-0.5 text-xs text-muted-foreground"
                      title={`${t._count.attachments} attachment(s)`}
                    >
                      <Paperclip className="size-3" aria-hidden />
                      {t._count.attachments}
                    </span>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
