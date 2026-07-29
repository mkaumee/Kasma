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
  openingInferred = false,
  closingInferred = false,
  initialRows,
}: {
  statementId: string;
  currency: string;
  openingBalance: string | null;
  closingBalance: string | null;
  /** Balance was derived from the rows, not read off the statement. */
  openingInferred?: boolean;
  closingInferred?: boolean;
  initialRows: EditorRow[];
}) {
  const router = useRouter();
  const makeRows = (rows: EditorRow[]): LocalRow[] =>
    rows.map((r) => ({ ...r, key: crypto.randomUUID() }));

  const [rows, setRows] = useState<LocalRow[]>(() => makeRows(initialRows));
  // Reviewer-editable statement balances. The extractor fills these; a reviewer
  // only corrects a misread figure. Editing them re-runs validation live.
  const [opening, setOpening] = useState(openingBalance ?? "");
  const [closing, setClosing] = useState(closingBalance ?? "");
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

  const openingTrim = opening.trim();
  const closingTrim = closing.trim();
  const openingValue = openingTrim === "" ? null : parseMoney(openingTrim, currency);
  const closingValue = closingTrim === "" ? null : parseMoney(closingTrim, currency);
  const openingInvalid = openingTrim !== "" && openingValue === null;
  const closingInvalid = closingTrim !== "" && closingValue === null;

  const summary = useMemo(() => {
    const v = validateBalances(
      {
        openingBalance: openingValue,
        closingBalance: closingValue,
        // A balance the reviewer typed is read, not derived — so it counts as
        // independent evidence and un-blocks the closing check.
        openingBalanceInferred: openingInferred && openingTrim === (openingBalance ?? ""),
        closingBalanceInferred: closingInferred && closingTrim === (closingBalance ?? ""),
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
      hasOpening: openingValue != null,
      hasClosing: closingValue != null,
      derivedOnly:
        openingValue != null && closingValue != null && v.closingOk === null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, currency, openingTrim, closingTrim]);

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
    setOpening(openingBalance ?? "");
    setClosing(closingBalance ?? "");
  }

  function save() {
    if (hasInvalid) {
      toast.error("Fix the highlighted amounts before saving.");
      return;
    }
    if (openingInvalid || closingInvalid) {
      toast.error("Fix the statement balances before saving.");
      return;
    }
    startTransition(async () => {
      const res = await saveStatementRowsAction({
        statementId,
        openingBalance: opening,
        closingBalance: closing,
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

      <div className="grid gap-3 border-b px-3 py-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Opening balance ({currency})
            {openingInferred && openingTrim === (openingBalance ?? "") ? (
              <span className="ml-1 normal-case tracking-normal">— derived from rows</span>
            ) : null}
          </span>
          <Input
            inputMode="decimal"
            placeholder="Not found on the statement"
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
            className={cn("text-right tabular-nums", openingInvalid && "border-destructive")}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Closing balance ({currency})
            {closingInferred && closingTrim === (closingBalance ?? "") ? (
              <span className="ml-1 normal-case tracking-normal">— derived from rows</span>
            ) : null}
          </span>
          <Input
            inputMode="decimal"
            placeholder="Not found on the statement"
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
            className={cn("text-right tabular-nums", closingInvalid && "border-destructive")}
          />
        </label>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          Read from the statement automatically. Correct them only if a figure is
          wrong — the running balance is what verifies the extracted rows.
        </p>
      </div>

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
