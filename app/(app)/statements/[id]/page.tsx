import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListChecks, Loader2 } from "lucide-react";

import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatMoney } from "@/lib/money/currency";
import {
  formatStatementPeriod,
  isStatementProcessing,
  STATEMENT_STATUS_LABEL,
  statementStatusVariant,
} from "@/lib/statements/status";
import { EmptyState } from "@/components/app/empty-state";
import { StatementsRefresher } from "@/components/statements/statements-refresher";
import { TransactionsPreview } from "@/components/statements/transactions-preview";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Statement" };

export default async function StatementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization } = await requireOrg();

  const statement = await prisma.statement.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      bankAccount: true,
      transactions: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
      importJobs: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!statement) notFound();

  const currency = statement.currency ?? statement.bankAccount.currency;
  const processing = isStatementProcessing(statement.status);
  const job = statement.importJobs[0];

  return (
    <div className="space-y-6">
      <StatementsRefresher active={processing} />
      <Link
        href="/statements"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Statements
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {statement.bankAccount.bankName} · {statement.bankAccount.accountName}
            {statement.bankAccount.last4
              ? ` ···· ${statement.bankAccount.last4}`
              : ""}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {statement.originalFilename ?? "Statement"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {formatStatementPeriod(
              statement.periodStart,
              statement.periodEnd,
            ) ?? `Uploaded ${statement.createdAt.toLocaleDateString()}`}
          </p>
        </div>
        <Badge variant={statementStatusVariant(statement.status)}>
          {processing && <Loader2 className="animate-spin" aria-hidden />}
          {STATEMENT_STATUS_LABEL[statement.status]}
        </Badge>
      </div>

      {statement.status === "FAILED" && job?.error && (
        <Card className="border-destructive/50">
          <CardHeader>
            <CardDescription className="text-destructive">
              Parsing failed
            </CardDescription>
            <CardTitle className="text-base font-normal">{job.error}</CardTitle>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Opening balance</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {statement.openingBalance != null
                ? formatMoney(statement.openingBalance, currency)
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Closing balance</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {statement.closingBalance != null
                ? formatMoney(statement.closingBalance, currency)
                : "—"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-xl tabular-nums">
              {statement.transactions.length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Extraction</CardDescription>
            <CardTitle className="text-xl">
              {statement.parserUsed ? (
                <span className="uppercase">{statement.parserUsed}</span>
              ) : (
                "—"
              )}
              {statement.confidence != null && (
                <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                  {Math.round(statement.confidence * 100)}%
                </span>
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Extracted transactions</CardTitle>
          <CardDescription>
            {statement.transactions.length > 0
              ? "Rows imported from this statement."
              : processing
                ? "Parsing in progress…"
                : "No transactions were extracted."}
          </CardDescription>
        </CardHeader>
        {statement.transactions.length > 0 ? (
          <TransactionsPreview
            currency={currency}
            transactions={statement.transactions.map((t) => ({
              id: t.id,
              date: t.date.toISOString(),
              description: t.description,
              amount: t.amount.toString(),
              direction: t.direction,
              runningBalance: t.runningBalance?.toString() ?? null,
            }))}
          />
        ) : (
          <div className="px-6 pb-6">
            <EmptyState
              icon={ListChecks}
              title="Nothing to show yet"
              description={
                processing
                  ? "Transactions will appear here once parsing finishes."
                  : "This statement produced no transactions."
              }
            />
          </div>
        )}
      </Card>
    </div>
  );
}
