"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";

import { validateBalances } from "@/lib/extraction/validate";
import { parseMoney } from "@/lib/money/currency";
import { saveStatementRowsAction } from "@/lib/statements/review-actions";
import { cn } from "@/lib/utils";
import { ReconciliationBanner } from "@/components/statements/reconciliation-banner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type EditorRow = {
  id?: string;
  date: string; // yyyy-mm-dd
  description: string;
  amount: string; // signed decimal
  balance: string;
  reference: string;
};

type LocalRow = EditorRow & { key: string };

export function StatementReviewEditor({
  statementId,
  currency,
  openingBalance,
  closingBalance,
  initialRows,
}: {
  statementId: string;
  currency: string;
  openingBalance: string | null;
  closingBalance: string | null;
  initialRows: EditorRow[];
}) {
  const router = useRouter();
  const makeRows = (rows: EditorRow[]): LocalRow[] =>
    rows.map((r) => ({ ...r, key: crypto.randomUUID() }));

  const [rows, setRows] = useState<LocalRow[]>(() => makeRows(initialRows));
  const [pending, startTransition] = useTransition();

  const parsed = rows.map((r) => {
    const amount = parseMoney(r.amount, currency);
    const balTrim = r.balance.trim();
    const balance = balTrim === "" ? null : parseMoney(balTrim, currency);
    return {
      amountValid: amount !== null,
      balanceValid: balTrim === "" || balance !== null,
      amount: amount ?? 0n,
      balance,
    };
  });
  const hasInvalid = parsed.some((p) => !p.amountValid || !p.balanceValid);

  const summary = useMemo(() => {
    const opening = openingBalance ? parseMoney(openingBalance, currency) : null;
    const closing = closingBalance ? parseMoney(closingBalance, currency) : null;
    const v = validateBalances(
      {
        openingBalance: opening,
        closingBalance: closing,
        rows: parsed.map((p) => ({ amount: p.amount, balance: p.balance })),
      },
      { parserConfidence: 0.5 },
    );
    return {
      ok: v.ok,
      hasBalances: v.hasBalances,
      closingOk: v.closingOk,
      closingDelta: v.closingDelta?.toString() ?? null,
      breaks: v.breaks.map((b) => ({ index: b.index, gap: b.gap.toString() })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, currency, openingBalance, closingBalance]);

  function update(key: string, field: keyof EditorRow, value: string) {
    setRows((prev) =>
      prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)),
    );
  }

  function addRow() {
    const lastDate = rows[rows.length - 1]?.date ?? "";
    setRows((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        date: lastDate,
        description: "",
        amount: "",
        balance: "",
        reference: "",
      },
    ]);
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }

  function reset() {
    setRows(makeRows(initialRows));
  }

  function save() {
    if (hasInvalid) {
      toast.error("Fix the highlighted amounts before saving.");
      return;
    }
    startTransition(async () => {
      const res = await saveStatementRowsAction({
        statementId,
        rows: rows.map((r) => ({
          id: r.id,
          date: r.date,
          description: r.description,
          amount: r.amount,
          balance: r.balance,
          reference: r.reference,
        })),
      });
      if (res?.error) {
        toast.error(res.error);
      } else {
        toast.success("Changes saved");
        router.refresh();
      }
    });
  }

  return (
    <div>
      <ReconciliationBanner currency={currency} summary={summary} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Description</th>
              <th className="px-3 py-2 text-right font-medium">Amount</th>
              <th className="px-3 py-2 text-right font-medium">Balance</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={r.key} className="align-top">
                <td className="px-3 py-1.5">
                  <Input
                    type="date"
                    value={r.date}
                    onChange={(e) => update(r.key, "date", e.target.value)}
                    className="h-8 w-[9.5rem]"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={r.description}
                    onChange={(e) =>
                      update(r.key, "description", e.target.value)
                    }
                    className="h-8 min-w-[12rem]"
                    placeholder="Description"
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={r.amount}
                    onChange={(e) => update(r.key, "amount", e.target.value)}
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-invalid={!parsed[i]!.amountValid}
                    className={cn(
                      "h-8 w-28 text-right tabular-nums",
                      !parsed[i]!.amountValid && "border-destructive",
                    )}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Input
                    value={r.balance}
                    onChange={(e) => update(r.key, "balance", e.target.value)}
                    inputMode="decimal"
                    placeholder="—"
                    aria-invalid={!parsed[i]!.balanceValid}
                    className={cn(
                      "h-8 w-28 text-right tabular-nums",
                      !parsed[i]!.balanceValid && "border-destructive",
                    )}
                  />
                </td>
                <td className="px-3 py-1.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeRow(r.key)}
                    aria-label="Delete row"
                  >
                    <Trash2 />
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-sm text-muted-foreground"
                >
                  No rows. Add one below or re-parse the statement.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <Button type="button" variant="outline" size="sm" onClick={addRow}>
          <Plus /> Add row
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={pending}
          >
            <Undo2 /> Reset
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={save}
            disabled={pending || hasInvalid}
          >
            <Save /> {pending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
