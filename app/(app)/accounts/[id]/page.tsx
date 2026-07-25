import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, ListChecks, Pencil } from "lucide-react";
import type { AccountType } from "@prisma/client";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { tenantDb } from "@/lib/db/tenant";
import { formatMoney, minorToDecimalString } from "@/lib/money/currency";
import { EmptyState } from "@/components/app/empty-state";
import { AccountDialog } from "@/components/bank/account-dialog";
import { DeleteAccountButton } from "@/components/bank/delete-account-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Account" };

const TYPE_LABELS: Record<AccountType, string> = {
  CHECKING: "Checking",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit card",
  LOAN: "Loan",
  OTHER: "Other",
};

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { organization, role } = await requireOrg();
  const canWrite = can(role, "accounts:write");

  const account = await tenantDb(organization.id).bankAccount.findFirst({
    where: { id },
  });
  if (!account) notFound();

  const agg = await prisma.transaction.aggregate({
    where: { organizationId: organization.id, bankAccountId: id },
    _sum: { amount: true },
    _count: true,
  });
  const currentBalance = account.openingBalance + (agg._sum.amount ?? 0n);

  return (
    <div className="space-y-6">
      <Link
        href="/accounts"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Accounts
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {account.bankName}
            {account.last4 ? ` ···· ${account.last4}` : ""}
          </p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">
              {account.accountName}
            </h1>
            <Badge variant="secondary">{TYPE_LABELS[account.type]}</Badge>
          </div>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <AccountDialog
              mode="edit"
              account={{
                id: account.id,
                bankName: account.bankName,
                accountName: account.accountName,
                last4: account.last4,
                currency: account.currency,
                type: account.type,
                openingBalance: minorToDecimalString(
                  account.openingBalance,
                  account.currency,
                ),
              }}
              trigger={
                <Button variant="outline" size="sm">
                  <Pencil /> Edit
                </Button>
              }
            />
            <DeleteAccountButton
              id={account.id}
              accountName={account.accountName}
            />
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Current balance</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(currentBalance, account.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Opening balance</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {formatMoney(account.openingBalance, account.currency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Transactions</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {agg._count}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ListChecks}
            title="No transactions yet"
            description="Upload a statement for this account to import its transactions."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statements</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={FileText}
            title="No statements yet"
            description="Uploaded statements for this account will appear here."
          />
        </CardContent>
      </Card>
    </div>
  );
}
