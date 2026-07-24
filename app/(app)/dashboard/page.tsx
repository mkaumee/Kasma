import type { Metadata } from "next";

import { requireOrg } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { organization } = await requireOrg();

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome to {organization.name}. Your multi-bank dashboard will appear
        here.
      </p>
    </div>
  );
}
