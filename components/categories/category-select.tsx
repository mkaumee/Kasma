"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { assignCategoryAction } from "@/lib/categories/actions";

const controlCls =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50";

/** Inline category assignment for a single transaction. */
export function CategorySelect({
  transactionId,
  value,
  categories,
}: {
  transactionId: string;
  value: string | null;
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(categoryId: string) {
    startTransition(async () => {
      const res = await assignCategoryAction({
        transactionId,
        categoryId: categoryId || null,
      });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <select
      value={value ?? ""}
      onChange={(e) => change(e.target.value)}
      disabled={pending}
      className={controlCls}
      aria-label="Category"
    >
      <option value="">Uncategorized</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
