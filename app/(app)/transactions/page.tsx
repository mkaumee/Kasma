import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
      <EmptyState
        icon={ArrowLeftRight}
        title="Transactions coming soon"
        description="Your centralized ledger of every credit, debit, charge, and payment."
      />
    </div>
  );
}
