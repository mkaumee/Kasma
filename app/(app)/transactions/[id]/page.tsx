import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Landmark } from "lucide-react";
import type { TransactionEventKind } from "@prisma/client";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { formatMoney } from "@/lib/money/currency";
import { fileHref } from "@/lib/storage/keys";
import { cn } from "@/lib/utils";
import { CategorySelect } from "@/components/categories/category-select";
import { EvidencePanel } from "@/components/evidence/evidence-panel";
import { NotesPanel } from "@/components/notes/notes-panel";
import {
  TransactionTimeline,
  type TimelineEvent,
} from "@/components/transactions/transaction-timeline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Transaction" };

const TYPE_LABEL: Record<string, string> = {
  CREDIT: "Credit",
  DEBIT: "Debit",
  CHARGE: "Charge",
  FEE: "Fee",
  PAYMENT: "Payment",
  TRANSFER: "Transfer",
};

const VERIFICATION = {
  VERIFIED: { label: "Verified", variant: "success" as const },
  DISPUTED: { label: "Disputed", variant: "destructive" as const },
  UNVERIFIED: { label: "Unverified", variant: "secondary" as const },
};

function eventDetail(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const source = (payload as Record<string, unknown>).source;
  if (source === "statement-import") return "Imported from statement";
  if (source === "review-edit") return "Edited during review";
  if (source === "review-add") return "Added during review";
  return null;
}

function MetaRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-right text-sm">{children}</span>
    </div>
  );
}

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await requireOrg();
  const canEdit = can(role, "transactions:write");

  const txn = await prisma.transaction.findFirst({
    where: { id, organizationId: organization.id },
    include: {
      bankAccount: { select: { id: true, bankName: true, accountName: true } },
      category: { select: { name: true, color: true } },
      statement: { select: { id: true, originalFilename: true } },
      attachments: { orderBy: { createdAt: "desc" } },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true, email: true } } },
      },
      events: {
        orderBy: { createdAt: "asc" },
        include: { actor: { select: { name: true, email: true } } },
      },
    },
  });
  if (!txn) notFound();

  const categories = canEdit
    ? await prisma.category.findMany({
        where: { organizationId: organization.id },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      })
    : [];

  const verification = VERIFICATION[txn.verificationStatus];
  const timeline: TimelineEvent[] = txn.events.map((e) => ({
    id: e.id,
    kind: e.kind as TransactionEventKind,
    createdAt: e.createdAt.toISOString(),
    actorName: e.actor?.name ?? e.actor?.email ?? null,
    detail: eventDetail(e.payload),
  }));

  return (
    <div className="space-y-6">
      <Link
        href="/transactions"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Transactions
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {txn.date.toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
              timeZone: "UTC",
            })}
          </p>
          <h1 className="truncate text-2xl font-semibold tracking-tight">
            {txn.description}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant={txn.direction === "CREDIT" ? "credit" : "debit"}>
              {TYPE_LABEL[txn.type] ?? txn.type}
            </Badge>
            <Badge variant={verification.variant}>{verification.label}</Badge>
            {txn.isDuplicate && <Badge variant="warning">Duplicate</Badge>}
            {txn.isInternalTransfer && (
              <Badge variant="secondary">Internal transfer</Badge>
            )}
          </div>
        </div>
        <div
          className={cn(
            "text-3xl font-semibold tabular-nums",
            txn.direction === "CREDIT" ? "text-credit" : "text-debit",
          )}
        >
          {formatMoney(txn.amount, txn.currency, { signDisplay: "always" })}
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Details</CardTitle>
          </CardHeader>
          <CardContent className="divide-y pt-0">
            <MetaRow label="Account">
              <Link
                href={`/accounts/${txn.bankAccount.id}`}
                className="inline-flex items-center gap-1 hover:underline"
              >
                <Landmark className="size-3.5 text-muted-foreground" />
                {txn.bankAccount.bankName} · {txn.bankAccount.accountName}
              </Link>
            </MetaRow>
            <MetaRow label="Category">
              {canEdit ? (
                <CategorySelect
                  transactionId={txn.id}
                  value={txn.categoryId}
                  categories={categories}
                />
              ) : txn.category ? (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: txn.category.color ?? "#a1a1aa" }}
                  />
                  {txn.category.name}
                </span>
              ) : (
                <span className="text-muted-foreground">Uncategorized</span>
              )}
            </MetaRow>
            <MetaRow label="Counterparty">
              {txn.counterparty ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </MetaRow>
            <MetaRow label="Reference">
              {txn.reference ?? (
                <span className="text-muted-foreground">—</span>
              )}
            </MetaRow>
            <MetaRow label="Running balance">
              <span className="tabular-nums">
                {txn.runningBalance != null
                  ? formatMoney(txn.runningBalance, txn.currency)
                  : "—"}
              </span>
            </MetaRow>
            <MetaRow label="Value date">
              {txn.valueDate ? (
                txn.valueDate.toLocaleDateString(undefined, {
                  timeZone: "UTC",
                })
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </MetaRow>
            <MetaRow label="Source statement">
              {txn.statement ? (
                <Link
                  href={`/statements/${txn.statement.id}`}
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  <FileText className="size-3.5 text-muted-foreground" />
                  {txn.statement.originalFilename ?? "Statement"}
                </Link>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </MetaRow>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Evidence</CardTitle>
          </CardHeader>
          <EvidencePanel
            transactionId={txn.id}
            canEdit={canEdit}
            items={txn.attachments.map((a) => ({
              id: a.id,
              kind: a.kind,
              filename: a.originalFilename ?? "attachment",
              size: a.size,
              href: fileHref(a.fileKey),
            }))}
          />
        </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Notes</CardTitle>
            </CardHeader>
            <NotesPanel
              transactionId={txn.id}
              canEdit={canEdit}
              notes={txn.notes.map((n) => ({
                id: n.id,
                body: n.body,
                authorName: n.author?.name ?? n.author?.email ?? null,
                createdAt: n.createdAt.toISOString(),
              }))}
            />
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Timeline</CardTitle>
            </CardHeader>
            <TransactionTimeline events={timeline} />
          </Card>
        </div>
      </div>
    </div>
  );
}
