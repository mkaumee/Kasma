import type { Metadata } from "next";

export const metadata: Metadata = { title: "Accounts" };

export default function AccountsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
      <p className="mt-2 text-muted-foreground">
        Add and monitor your company bank accounts here.
      </p>
    </div>
  );
}
