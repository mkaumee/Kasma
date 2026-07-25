import type { Metadata } from "next";
import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <EmptyState
        icon={Landmark}
        title="Accounts coming soon"
        description="Add your company bank accounts to start monitoring balances."
      />
    </div>
  );
}
