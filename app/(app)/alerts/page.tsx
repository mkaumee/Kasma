import type { Metadata } from "next";

export const metadata: Metadata = { title: "Alerts" };

export default function AlertsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
      <p className="mt-2 text-muted-foreground">
        Mismatches, missing transactions, and unusual activity will surface
        here.
      </p>
    </div>
  );
}
