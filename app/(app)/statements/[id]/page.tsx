import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ListChecks, Loader2 } from "lucide-react";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatMoney, minorToDecimalString } from "@/lib/money/currency";
import { reconcileStatement } from "@/lib/statements/reconcile";
import {
  formatStatementPeriod,
  isStatementProcessing,
  STATEMENT_STATUS_LABEL,
  statementStatusVariant,
} from "@/lib/statements/status";
import { getStorage } from "@/lib/storage";
import { fileHref } from "@/lib/storage/keys";
import { EmptyState } from "@/components/app/empty-state";
import {
  FilePreview,
  previewKindFor,
} from "@/components/statements/file-preview";
import { ReconciliationBanner } from "@/components/statements/reconciliation-banner";
import { StatementReviewEditor } from "@/components/statements/statement-review-editor";
import { StatementsRefresher } from "@/components/statements/statements-refresher";
import { TransactionsPreview } from "@/components/statements/transactions-preview";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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
  const { organization, role } = await requireOrg();
  const canEdit = can(role, "transactions:write");

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

  const previewKind = statement.originalFilename
    ? previewKindFor(statement.originalFilename)
    : "other";
  let previewText: string | undefined;
  if (statement.fileKey && previewKind === "text") {
    try {
      const bytes = await getStorage().get(statement.fileKey);
      previewText = bytes.toString("utf-8").slice(0, 20_000);
    } catch {
      previewText = undefined;
    }
  }

  const reconciliation =
    statement.transactions.length > 0
      ? reconcileStatement(
          statement,
          statement.transactions,
          statement.confidence ?? 0.5,
        )
      : null;

  // Reviewers can edit rows until the statement is confirmed.
  const editable = canEdit && !processing && statement.status !== "CONFIRMED";

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

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Original file</CardTitle>
            <CardDescription>
              The statement exactly as uploaded, for side-by-side review.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statement.fileKey ? (
              <FilePreview
                href={fileHref(statement.fileKey)}
                kind={previewKind}
                filename={statement.originalFilename ?? "statement"}
                text={previewText}
              />
            ) : (
              <EmptyState
                icon={FileText}
                title="File unavailable"
                description="The uploaded file could not be located in storage."
              />
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Extracted transactions</CardTitle>
            <CardDescription>
              {statement.transactions.length > 0
                ? `${statement.transactions.length} row${
                    statement.transactions.length === 1 ? "" : "s"
                  } imported from this statement.`
                : processing
                  ? "Parsing in progress…"
                  : "No transactions were extracted."}
            </CardDescription>
          </CardHeader>
          {editable ? (
            <StatementReviewEditor
              key={statement.updatedAt.toISOString()}
              statementId={statement.id}
              currency={currency}
              openingBalance={
                statement.openingBalance != null
                  ? minorToDecimalString(statement.openingBalance, currency)
                  : null
              }
              closingBalance={
                statement.closingBalance != null
                  ? minorToDecimalString(statement.closingBalance, currency)
                  : null
              }
              initialRows={statement.transactions.map((t) => ({
                id: t.id,
                date: t.date.toISOString().slice(0, 10),
                description: t.description,
                amount: minorToDecimalString(t.amount, currency),
                balance:
                  t.runningBalance != null
                    ? minorToDecimalString(t.runningBalance, currency)
                    : "",
                reference: t.reference ?? "",
              }))}
            />
          ) : (
            <>
              {reconciliation && (
                <ReconciliationBanner
                  currency={currency}
                  summary={{
                    ok: reconciliation.ok,
                    hasBalances: reconciliation.hasBalances,
                    closingOk: reconciliation.closingOk,
                    closingDelta:
                      reconciliation.closingDelta?.toString() ?? null,
                    breaks: reconciliation.breaks.map((b) => ({
                      index: b.index,
                      gap: b.gap.toString(),
                    })),
                  }}
                />
              )}
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
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
