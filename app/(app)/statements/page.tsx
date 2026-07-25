import type { Metadata } from "next";
import { FileText } from "lucide-react";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantDb } from "@/lib/db/tenant";
import {
  STATEMENT_STATUS_LABEL,
  statementStatusVariant,
} from "@/lib/statements/status";
import { EmptyState } from "@/components/app/empty-state";
import { UploadStatementDialog } from "@/components/statements/upload-statement-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Statements" };

export default async function StatementsPage() {
  const { organization, role } = await requireOrg();
  const canWrite = can(role, "statements:write");

  const [accounts, statements] = await Promise.all([
    tenantDb(organization.id).bankAccount.findMany({
      orderBy: { createdAt: "asc" },
    }),
    prisma.statement.findMany({
      where: { organizationId: organization.id },
      include: { bankAccount: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    label: `${a.bankName} · ${a.accountName}`,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Statements</h1>
        {canWrite && accountOptions.length > 0 && (
          <UploadStatementDialog accounts={accountOptions} />
        )}
      </div>

      {accountOptions.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="Add an account first"
          description="Create a bank account, then upload its statements to import transactions."
        />
      ) : statements.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No statements yet"
          description="Upload a PDF, Excel, or CSV statement to extract its transactions."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Uploaded statements</CardTitle>
            <CardDescription>
              {statements.length} statement{statements.length === 1 ? "" : "s"}
            </CardDescription>
          </CardHeader>
          <CardContent className="divide-y">
            {statements.map((statement) => (
              <div
                key={statement.id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {statement.originalFilename ?? "Statement"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {statement.bankAccount.bankName} ·{" "}
                    {statement.bankAccount.accountName} ·{" "}
                    {statement.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <Badge variant={statementStatusVariant(statement.status)}>
                  {STATEMENT_STATUS_LABEL[statement.status]}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
