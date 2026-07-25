"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import {
  deleteCategoryAction,
  saveCategoryAction,
} from "@/lib/categories/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const PALETTE = [
  "#4f46e5",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#64748b",
];

export type CategoryItem = {
  id: string;
  name: string;
  color: string | null;
  count: number;
};

function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {PALETTE.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Color ${c}`}
          className={cn(
            "size-5 rounded-full border",
            value === c ? "ring-2 ring-ring ring-offset-1" : "border-transparent",
          )}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export function CategoryManager({
  categories,
}: {
  categories: CategoryItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]!);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState(PALETTE[0]!);

  function create() {
    if (!newName.trim()) return;
    startTransition(async () => {
      const res = await saveCategoryAction({ name: newName, color: newColor });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Category added");
        setNewName("");
        router.refresh();
      }
    });
  }

  function startEdit(c: CategoryItem) {
    setEditingId(c.id);
    setEditName(c.name);
    setEditColor(c.color ?? PALETTE[0]!);
  }

  function saveEdit() {
    startTransition(async () => {
      const res = await saveCategoryAction({
        id: editingId!,
        name: editName,
        color: editColor,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Category updated");
        setEditingId(null);
        router.refresh();
      }
    });
  }

  function remove(c: CategoryItem) {
    if (
      !window.confirm(
        `Delete “${c.name}”? Its ${c.count} transaction(s) will become uncategorized.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteCategoryAction(c.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Category deleted");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-muted/30 p-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-muted-foreground">
            New category
          </label>
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Payroll, Software, Travel"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
            }}
          />
        </div>
        <ColorPicker value={newColor} onChange={setNewColor} />
        <Button size="sm" onClick={create} disabled={pending || !newName.trim()}>
          <Plus /> Add
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No categories yet. Add one above to start organizing transactions.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {categories.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
              {editingId === c.id ? (
                <>
                  <ColorPicker value={editColor} onChange={setEditColor} />
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 flex-1"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={saveEdit}
                    disabled={pending}
                    aria-label="Save"
                  >
                    <Check />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    onClick={() => setEditingId(null)}
                    aria-label="Cancel"
                  >
                    <X />
                  </Button>
                </>
              ) : (
                <>
                  <span
                    className="size-3 rounded-full"
                    style={{ backgroundColor: c.color ?? "#a1a1aa" }}
                  />
                  <span className="flex-1 font-medium">{c.name}</span>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {c.count} txn{c.count === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground"
                    onClick={() => startEdit(c)}
                    aria-label={`Edit ${c.name}`}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => remove(c)}
                    aria-label={`Delete ${c.name}`}
                  >
                    <Trash2 />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
