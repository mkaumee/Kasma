"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import type { LedgerQuery } from "@/lib/transactions/url";
import { bulkVerifyAction } from "@/lib/verification/actions";
import { Button } from "@/components/ui/button";

const controlCls =
  "h-8 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

/** Set the verification status of every transaction matching the filters. */
export function BulkVerify({
  query,
  total,
}: {
  query: LedgerQuery;
  total: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"VERIFIED" | "DISPUTED" | "UNVERIFIED">(
    "VERIFIED",
  );

  function apply() {
    if (
      !window.confirm(
        `Set ${status.toLowerCase()} on all ${total} matching transaction(s)?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await bulkVerifyAction({
        query: query as Record<string, string | undefined>,
        status,
      });
      if (res.error) toast.error(res.error);
      else {
        toast.success(`Updated ${res.count ?? 0} transaction(s)`);
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <ShieldCheck className="size-4 text-muted-foreground" aria-hidden />
      <span className="text-muted-foreground">Mark all {total} matching:</span>
      <select
        value={status}
        onChange={(e) => setStatus(e.target.value as "VERIFIED")}
        className={controlCls}
        aria-label="Verification status to apply"
      >
        <option value="VERIFIED">Verified</option>
        <option value="DISPUTED">Disputed</option>
        <option value="UNVERIFIED">Unverified</option>
      </select>
      <Button size="sm" variant="outline" onClick={apply} disabled={pending}>
        Apply
      </Button>
    </div>
  );
}
