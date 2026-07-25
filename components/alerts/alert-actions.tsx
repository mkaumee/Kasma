"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Eye, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

import {
  acknowledgeAlertAction,
  dismissAlertAction,
  reopenAlertAction,
  resolveAlertAction,
} from "@/lib/alerts/actions";
import { Button } from "@/components/ui/button";

type Status = "OPEN" | "ACKNOWLEDGED" | "RESOLVED" | "DISMISSED";

export function AlertActions({
  alertId,
  status,
}: {
  alertId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function act(fn: (id: string) => Promise<{ ok?: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn(alertId);
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  const open = status === "OPEN" || status === "ACKNOWLEDGED";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {status === "OPEN" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => act(acknowledgeAlertAction)}
        >
          <Eye /> Acknowledge
        </Button>
      )}
      {open && (
        <>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => act(resolveAlertAction)}
          >
            <Check /> Resolve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => act(dismissAlertAction)}
          >
            <X /> Dismiss
          </Button>
        </>
      )}
      {!open && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => act(reopenAlertAction)}
        >
          <RotateCcw /> Reopen
        </Button>
      )}
    </div>
  );
}
