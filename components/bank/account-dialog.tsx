"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";

import {
  createBankAccountAction,
  updateBankAccountAction,
  type AccountFormState,
} from "@/lib/bank/actions";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/money/currency";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACCOUNT_TYPES = [
  { value: "CHECKING", label: "Checking" },
  { value: "SAVINGS", label: "Savings" },
  { value: "CREDIT_CARD", label: "Credit card" },
  { value: "LOAN", label: "Loan" },
  { value: "OTHER", label: "Other" },
];

const selectClass =
  "border-input dark:bg-input/30 h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export type AccountFormValues = {
  id: string;
  bankName: string;
  accountName: string;
  last4: string | null;
  currency: string;
  type: string;
  openingBalance: string;
};

export function AccountDialog({
  mode,
  account,
  trigger,
}: {
  mode: "create" | "edit";
  account?: AccountFormValues;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<
    AccountFormState,
    FormData
  >(
    mode === "create" ? createBankAccountAction : updateBankAccountAction,
    undefined,
  );

  useEffect(() => {
    if (state?.ok) {
      toast.success(mode === "create" ? "Account added." : "Account updated.");
      // Defer closing out of the effect body (reacting to a completed action).
      queueMicrotask(() => setOpen(false));
    }
  }, [state, mode]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Add bank account" : "Edit account"}
          </DialogTitle>
          <DialogDescription>
            Balances are tracked in the account&apos;s own currency.
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          {mode === "edit" && account && (
            <input type="hidden" name="id" value={account.id} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bankName">Bank</Label>
              <Input
                id="bankName"
                name="bankName"
                defaultValue={account?.bankName}
                placeholder="Chase"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountName">Account name</Label>
              <Input
                id="accountName"
                name="accountName"
                defaultValue={account?.accountName}
                placeholder="Operating"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account number</Label>
              <Input
                id="accountNumber"
                name="accountNumber"
                defaultValue={account?.last4 ? `••••${account.last4}` : ""}
                placeholder="Only the last 4 are stored"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                name="currency"
                defaultValue={account?.currency ?? "USD"}
                className={selectClass}
              >
                {CURRENCY_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} — {CURRENCIES[code].name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                name="type"
                defaultValue={account?.type ?? "CHECKING"}
                className={selectClass}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="openingBalance">Opening balance</Label>
              <Input
                id="openingBalance"
                name="openingBalance"
                defaultValue={account?.openingBalance ?? "0.00"}
                inputMode="decimal"
                className="tabular-nums"
              />
            </div>
          </div>
          {state?.error && (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" type="button">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : mode === "create"
                  ? "Add account"
                  : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
