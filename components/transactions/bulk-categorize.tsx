"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Tag } from "lucide-react";
import { toast } from "sonner";

import { bulkCategorizeAction } from "@/lib/categories/actions";
import type { LedgerQuery } from "@/lib/transactions/url";
import { Button } from "@/components/ui/button";

const controlCls =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/**
 * Assign a category to every transaction matching the current filters — a
 * filter-first alternative to per-row selection. `query` carries the active
 * ledger filters (sort/page keys are ignored server-side).
 */
export function BulkCategorize({
  query,
  categories,
  total,
}: {
  query: LedgerQuery;
  categories: { id: string; name: string }[];
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState("");

  function apply() {
    if (
      !window.confirm(
        `Apply this category to all ${total} matching transaction(s)?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await bulkCategorizeAction({
        query: query as Record<string, string | undefined>,
        categoryId: categoryId || null,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Categorized ${res.count ?? 0} transaction(s)`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Tag className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">
        Categorize all {total} matching:
      </span>
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className={controlCls}
        aria-label="Category to apply"
      >
        <option value="">Uncategorized</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" variant="outline" onClick={apply} disabled={pending}>
        Apply
      </Button>
    </div>
  );
}
