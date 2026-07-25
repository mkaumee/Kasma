"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import {
  confirmStatementAction,
  reparseStatementAction,
} from "@/lib/statements/confirm-actions";
import { Button } from "@/components/ui/button";

export function StatementActions({
  statementId,
  canConfirm,
  canReparse,
}: {
  statementId: string;
  canConfirm: boolean;
  canReparse: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      const res = await confirmStatementAction(statementId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Statement confirmed");
        router.refresh();
      }
    });
  }

  function reparse() {
    if (
      !window.confirm(
        "Re-parsing discards the current rows and extracts them again from the file. Continue?",
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await reparseStatementAction(statementId);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Re-parsing queued");
        router.refresh();
      }
    });
  }

  if (!canConfirm && !canReparse) return null;

  return (
    <div className="flex items-center gap-2">
      {canReparse && (
        <Button
          variant="outline"
          size="sm"
          onClick={reparse}
          disabled={pending}
        >
          <RefreshCw /> Re-parse
        </Button>
      )}
      {canConfirm && (
        <Button size="sm" onClick={confirm} disabled={pending}>
          <Check /> Confirm
        </Button>
      )}
    </div>
  );
}
