"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  deleteRuleAction,
  runRulesAction,
  saveRuleAction,
  toggleRuleAction,
} from "@/lib/rules/actions";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const controlCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const FIELD_LABEL: Record<string, string> = {
  description: "Description",
  counterparty: "Counterparty",
  reference: "Reference",
};
const OP_LABEL: Record<string, string> = {
  contains: "contains",
  equals: "equals",
  startsWith: "starts with",
};

export type RuleItem = {
  id: string;
  name: string;
  isActive: boolean;
  field: string;
  op: string;
  value: string;
  direction: string | null;
  categoryName: string | null;
};

export function RuleManager({
  rules,
  categories,
}: {
  rules: RuleItem[];
  categories: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [name, setName] = useState("");
  const [field, setField] = useState("description");
  const [op, setOp] = useState("contains");
  const [value, setValue] = useState("");
  const [direction, setDirection] = useState("");
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");

  function create() {
    startTransition(async () => {
      const res = await saveRuleAction({
        name,
        field: field as "description",
        op: op as "contains",
        value,
        direction: direction ? (direction as "CREDIT") : undefined,
        categoryId,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success("Rule created");
        setName("");
        setValue("");
        router.refresh();
      }
    });
  }

  function toggle(r: RuleItem) {
    startTransition(async () => {
      const res = await toggleRuleAction(r.id, !r.isActive);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  function remove(r: RuleItem) {
    if (!window.confirm(`Delete rule “${r.name}”?`)) return;
    startTransition(async () => {
      const res = await deleteRuleAction(r.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Rule deleted");
        router.refresh();
      }
    });
  }

  function runNow() {
    startTransition(async () => {
      const res = await runRulesAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Categorized ${res.count ?? 0} transaction(s)`);
        router.refresh();
      }
    });
  }

  const canCreate = name.trim() && value.trim() && categoryId;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Rule name (e.g. Uber → Travel)"
          className="sm:col-span-2 lg:col-span-3"
        />
        <select
          value={field}
          onChange={(e) => setField(e.target.value)}
          className={controlCls}
          aria-label="Field"
        >
          <option value="description">Description</option>
          <option value="counterparty">Counterparty</option>
          <option value="reference">Reference</option>
        </select>
        <select
          value={op}
          onChange={(e) => setOp(e.target.value)}
          className={controlCls}
          aria-label="Operator"
        >
          <option value="contains">contains</option>
          <option value="equals">equals</option>
          <option value="startsWith">starts with</option>
        </select>
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Match text"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          className={controlCls}
          aria-label="Direction"
        >
          <option value="">Any direction</option>
          <option value="CREDIT">Credit only</option>
          <option value="DEBIT">Debit only</option>
        </select>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={controlCls}
          aria-label="Category"
        >
          {categories.length === 0 && <option value="">No categories</option>}
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={create}
          disabled={pending || !canCreate}
          className="justify-self-start"
        >
          <Plus /> Add rule
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Rules run automatically on import, or on demand for existing
          uncategorized transactions.
        </p>
        <Button
          size="sm"
          variant="outline"
          onClick={runNow}
          disabled={pending || rules.length === 0}
        >
          <Play /> Run now
        </Button>
      </div>

      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  {!r.isActive && <Badge variant="secondary">Off</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">
                  When {FIELD_LABEL[r.field] ?? r.field} {OP_LABEL[r.op] ?? r.op}{" "}
                  <span className="font-mono">“{r.value}”</span>
                  {r.direction ? ` (${r.direction.toLowerCase()})` : ""} →{" "}
                  {r.categoryName ?? "—"}
                </p>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className={cn(
                  "size-8",
                  r.isActive ? "text-muted-foreground" : "text-muted-foreground/50",
                )}
                onClick={() => toggle(r)}
                aria-label={r.isActive ? "Disable rule" : "Enable rule"}
                title={r.isActive ? "Disable" : "Enable"}
              >
                <Power />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-muted-foreground hover:text-destructive"
                onClick={() => remove(r)}
                aria-label={`Delete ${r.name}`}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
