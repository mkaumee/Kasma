import type { Metadata } from "next";
import type { Role } from "@prisma/client";

import { can, roleLabel } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { OrgProfileForm } from "@/components/org/org-profile-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Organization" };

const ROLE_INFO: { role: Role; description: string }[] = [
  {
    role: "OWNER",
    description: "Full access, including organization settings and members.",
  },
  {
    role: "ADMIN",
    description: "Manage members, accounts, statements, and alerts.",
  },
  {
    role: "ACCOUNTANT",
    description: "Manage accounts, statements, transactions, and alerts.",
  },
  { role: "VIEWER", description: "Read-only access to all financial data." },
];

export default async function OrganizationSettingsPage() {
  const { organization, role } = await requireOrg();
  const canManage = can(role, "org:manage");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization</CardTitle>
          <CardDescription>
            Your organization&apos;s name and identifier.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canManage ? (
            <OrgProfileForm
              defaultName={organization.name}
              slug={organization.slug}
              baseCurrency={organization.baseCurrency}
            />
          ) : (
            <div className="space-y-1">
              <p className="font-medium">{organization.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                {organization.slug}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Roles</CardTitle>
          <CardDescription>What each role can do in Kasma.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {ROLE_INFO.map(({ role: r, description }) => (
            <div
              key={r}
              className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <span className="w-28 shrink-0 font-medium">{roleLabel(r)}</span>
              <span className="text-sm text-muted-foreground">
                {description}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
