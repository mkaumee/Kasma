import type { Metadata } from "next";
import { BellRing } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Alerts" };

export default function AlertsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
      <EmptyState
        icon={BellRing}
        title="Alerts coming soon"
        description="Mismatches, missing transactions, and unusual activity will surface here."
      />
    </div>
  );
}
