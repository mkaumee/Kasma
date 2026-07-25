"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Filter, Star, X } from "lucide-react";

import type { LedgerFilters } from "@/lib/transactions/filters";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Option = { value: string; label: string };

const controlCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const TYPE_OPTIONS: Option[] = [
  { value: "", label: "Any type" },
  { value: "CREDIT", label: "Credit" },
  { value: "DEBIT", label: "Debit" },
  { value: "CHARGE", label: "Charge" },
  { value: "FEE", label: "Fee" },
  { value: "PAYMENT", label: "Payment" },
  { value: "TRANSFER", label: "Transfer" },
];

type SavedView = { name: string; query: string };
const VIEWS_KEY = "kasma:ledger-views";

export function LedgerFilters({
  filters,
  accounts,
  categories,
  sort,
  dir,
}: {
  filters: LedgerFilters;
  accounts: Option[];
  categories: Option[];
  sort?: string;
  dir?: string;
}) {
  const router = useRouter();
  // Initialized from the URL-derived filters; the parent remounts this via a
  // `key` when the URL changes, so no prop-sync effect is needed.
  const [f, setF] = useState<LedgerFilters>(filters);
  const [views, setViews] = useState<SavedView[]>([]);

  // Load browser-local saved views once on mount (localStorage is client-only,
  // so this can't run during render/SSR).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(VIEWS_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setViews(JSON.parse(raw) as SavedView[]);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  function set<K extends keyof LedgerFilters>(key: K, value: string) {
    setF((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function toQuery(): string {
    const sp = new URLSearchParams();
    if (f.search) sp.set("q", f.search);
    if (f.accountId) sp.set("account", f.accountId);
    if (f.direction) sp.set("direction", f.direction);
    if (f.type) sp.set("type", f.type);
    if (f.categoryId) sp.set("category", f.categoryId);
    if (f.verification) sp.set("verification", f.verification);
    if (f.dateFrom) sp.set("from", f.dateFrom);
    if (f.dateTo) sp.set("to", f.dateTo);
    if (f.amountMin) sp.set("min", f.amountMin);
    if (f.amountMax) sp.set("max", f.amountMax);
    if (f.evidence) sp.set("evidence", f.evidence);
    if (sort) sp.set("sort", sort);
    if (dir) sp.set("dir", dir);
    return sp.toString();
  }

  function apply() {
    const q = toQuery();
    router.push(q ? `/transactions?${q}` : "/transactions");
  }

  function clear() {
    setF({});
    router.push("/transactions");
  }

  function saveView() {
    const name = window.prompt("Name this view");
    if (!name) return;
    const next = [
      ...views.filter((v) => v.name !== name),
      { name, query: toQuery() },
    ];
    setViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
  }

  function deleteView(name: string) {
    const next = views.filter((v) => v.name !== name);
    setViews(next);
    localStorage.setItem(VIEWS_KEY, JSON.stringify(next));
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <div className="sm:col-span-2 lg:col-span-2">
          <Input
            value={f.search ?? ""}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Search description, counterparty, reference…"
          />
        </div>
        <select
          value={f.accountId ?? ""}
          onChange={(e) => set("accountId", e.target.value)}
          className={controlCls}
          aria-label="Account"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
        <select
          value={f.categoryId ?? ""}
          onChange={(e) => set("categoryId", e.target.value)}
          className={controlCls}
          aria-label="Category"
        >
          <option value="">All categories</option>
          <option value="none">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select
          value={f.direction ?? ""}
          onChange={(e) => set("direction", e.target.value)}
          className={controlCls}
          aria-label="Direction"
        >
          <option value="">Any direction</option>
          <option value="CREDIT">Credit (in)</option>
          <option value="DEBIT">Debit (out)</option>
        </select>
        <select
          value={f.type ?? ""}
          onChange={(e) => set("type", e.target.value)}
          className={controlCls}
          aria-label="Type"
        >
          {TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={f.verification ?? ""}
          onChange={(e) => set("verification", e.target.value)}
          className={controlCls}
          aria-label="Verification"
        >
          <option value="">Any verification</option>
          <option value="UNVERIFIED">Unverified</option>
          <option value="VERIFIED">Verified</option>
          <option value="DISPUTED">Disputed</option>
        </select>
        <select
          value={f.evidence ?? ""}
          onChange={(e) => set("evidence", e.target.value)}
          className={controlCls}
          aria-label="Evidence"
        >
          <option value="">Any evidence</option>
          <option value="yes">Has evidence</option>
          <option value="no">Missing evidence</option>
        </select>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={f.dateFrom ?? ""}
            onChange={(e) => set("dateFrom", e.target.value)}
            aria-label="From date"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            type="date"
            value={f.dateTo ?? ""}
            onChange={(e) => set("dateTo", e.target.value)}
            aria-label="To date"
          />
        </div>
        <div className="flex items-center gap-2">
          <Input
            inputMode="decimal"
            value={f.amountMin ?? ""}
            onChange={(e) => set("amountMin", e.target.value)}
            placeholder="Min"
            aria-label="Minimum amount"
            className="text-right tabular-nums"
          />
          <span className="text-muted-foreground">–</span>
          <Input
            inputMode="decimal"
            value={f.amountMax ?? ""}
            onChange={(e) => set("amountMax", e.target.value)}
            placeholder="Max"
            aria-label="Maximum amount"
            className="text-right tabular-nums"
          />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" size="sm">
            <Filter /> Apply
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <X /> Clear
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={saveView}
            className="ml-auto"
          >
            <Bookmark /> Save view
          </Button>
        </div>
      </form>

      {views.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-xs text-muted-foreground">Saved views:</span>
          {views.map((v) => (
            <span
              key={v.name}
              className="inline-flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pl-2 pr-1 text-xs"
            >
              <button
                type="button"
                onClick={() =>
                  router.push(v.query ? `/transactions?${v.query}` : "/transactions")
                }
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Star className="size-3" aria-hidden />
                {v.name}
              </button>
              <button
                type="button"
                onClick={() => deleteView(v.name)}
                aria-label={`Delete view ${v.name}`}
                className={cn(
                  "rounded-full p-0.5 text-muted-foreground hover:text-destructive",
                )}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
