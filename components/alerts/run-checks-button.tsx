"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { runControlsAction } from "@/lib/controls/actions";
import { Button } from "@/components/ui/button";

export function RunChecksButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = await runControlsAction();
      if (res.error) toast.error(res.error);
      else {
        toast.success("Checks complete");
        router.refresh();
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={run} disabled={pending}>
      <RefreshCw className={pending ? "animate-spin" : ""} />{" "}
      {pending ? "Running…" : "Run checks"}
    </Button>
  );
}
