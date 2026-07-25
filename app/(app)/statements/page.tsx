import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";

export const metadata: Metadata = { title: "Statements" };

export default function StatementsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
      <EmptyState
        icon={FileText}
        title="Statements coming soon"
        description="Upload PDF or Excel statements and transactions will be extracted automatically."
      />
    </div>
  );
}
