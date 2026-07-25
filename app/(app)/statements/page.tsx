import type { Metadata } from "next";

export const metadata: Metadata = { title: "Statements" };

export default function StatementsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
      <p className="mt-2 text-muted-foreground">
        Upload PDF or Excel statements and track their processing here.
      </p>
    </div>
  );
}
