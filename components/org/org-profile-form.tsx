"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";

import { updateOrganizationNameAction } from "@/lib/org/actions";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/money/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const selectClass =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export function OrgProfileForm({
  defaultName,
  slug,
  baseCurrency,
}: {
  defaultName: string;
  slug: string;
  baseCurrency: string;
}) {
  const [state, action, pending] = useActionState(
    updateOrganizationNameAction,
    undefined,
  );

  useEffect(() => {
    if (state?.success) toast.success(state.success);
  }, [state]);

  return (
    <form action={action} className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">Name</Label>
        <Input id="org-name" name="name" defaultValue={defaultName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-slug">Identifier</Label>
        <Input
          id="org-slug"
          value={slug}
          readOnly
          disabled
          className="font-mono text-xs"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-base-currency">Base currency</Label>
        <select
          id="org-base-currency"
          name="baseCurrency"
          defaultValue={baseCurrency}
          className={selectClass}
        >
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code} — {CURRENCIES[code].name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Used for cross-account totals.
        </p>
      </div>
      {state?.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save changes"}
      </Button>
    </form>
  );
}
