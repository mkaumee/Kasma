"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { setVerificationAction } from "@/lib/verification/actions";
import { cn } from "@/lib/utils";

type Status = "VERIFIED" | "DISPUTED" | "UNVERIFIED";

const OPTIONS: { value: Status; label: string; active: string }[] = [
  { value: "VERIFIED", label: "Verified", active: "bg-success text-success-foreground" },
  { value: "DISPUTED", label: "Disputed", active: "bg-destructive text-white" },
  { value: "UNVERIFIED", label: "Unverified", active: "bg-secondary text-secondary-foreground" },
];

/** Segmented control to set a transaction's verification status. */
export function VerificationControl({
  transactionId,
  value,
}: {
  transactionId: string;
  value: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function set(status: Status) {
    if (status === value) return;
    startTransition(async () => {
      const res = await setVerificationAction({ transactionId, status });
      if (res.error) toast.error(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="inline-flex rounded-md border p-0.5">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => set(o.value)}
          disabled={pending}
          className={cn(
            "rounded px-2 py-1 text-xs font-medium transition-colors disabled:opacity-60",
            value === o.value
              ? o.active
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
