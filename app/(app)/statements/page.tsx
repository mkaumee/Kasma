import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, FileText, Loader2 } from "lucide-react";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantDb } from "@/lib/db/tenant";
import {
  formatStatementPeriod,
  isStatementProcessing,
  STATEMENT_STATUS_LABEL,
  statementStatusVariant,
} from "@/lib/statements/status";
import { EmptyState } from "@/components/app/empty-state";
import { StatementsRefresher } from "@/components/statements/statements-refresher";
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
      include: { bankAccount: true, _count: { select: { transactions: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    label: `${a.bankName} · ${a.accountName}`,
  }));
  const anyProcessing = statements.some((s) => isStatementProcessing(s.status));

  return (
    <div className="space-y-6">
      <StatementsRefresher active={anyProcessing} />
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
          <CardContent className="divide-y p-0">
            {statements.map((statement) => {
              const processing = isStatementProcessing(statement.status);
              return (
                <Link
                  key={statement.id}
                  href={`/statements/${statement.id}`}
                  className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {statement.originalFilename ?? "Statement"}
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {statement.bankAccount.bankName} ·{" "}
                      {statement.bankAccount.accountName} ·{" "}
                      {formatStatementPeriod(
                        statement.periodStart,
                        statement.periodEnd,
                      ) ?? statement.createdAt.toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    {statement._count.transactions > 0 && (
                      <span className="hidden text-sm tabular-nums text-muted-foreground sm:inline">
                        {statement._count.transactions} txn
                        {statement._count.transactions === 1 ? "" : "s"}
                      </span>
                    )}
                    <Badge variant={statementStatusVariant(statement.status)}>
                      {processing && (
                        <Loader2 className="animate-spin" aria-hidden />
                      )}
                      {STATEMENT_STATUS_LABEL[statement.status]}
                    </Badge>
                    <ChevronRight
                      className="size-4 text-muted-foreground"
                      aria-hidden
                    />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
