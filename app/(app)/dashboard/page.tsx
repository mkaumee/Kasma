import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, FileClock, Landmark, Wallet } from "lucide-react";

import {
  ALERT_TYPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SEVERITY_VARIANT,
  alertDetailLine,
} from "@/lib/alerts/display";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { getAccountBalances } from "@/lib/dashboard/balances";
import { getDashboardTimeseries } from "@/lib/dashboard/timeseries";
import { currencyDecimals, formatMoney } from "@/lib/money/currency";
import { totalInBaseCurrency } from "@/lib/money/fx";
import { EmptyState } from "@/components/app/empty-state";
import { CashPositionChart } from "@/components/dashboard/cash-position-chart";
import { FlowsChart } from "@/components/dashboard/flows-chart";
import { StatCard } from "@/components/dashboard/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { organization } = await requireOrg();
  const base = organization.baseCurrency;

  const [accounts, openAlerts, needsReview, series, topAlerts, reviewStatements] =
    await Promise.all([
      getAccountBalances(organization.id),
      prisma.alert.count({
        where: { organizationId: organization.id, status: "OPEN" },
      }),
      prisma.statement.count({
        where: { organizationId: organization.id, status: "NEEDS_REVIEW" },
      }),
      getDashboardTimeseries(organization.id, base),
      prisma.alert.findMany({
        where: { organizationId: organization.id, status: "OPEN" },
        include: {
          bankAccount: { select: { bankName: true, accountName: true } },
          statement: { select: { originalFilename: true } },
          transaction: { select: { description: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.statement.findMany({
        where: { organizationId: organization.id, status: "NEEDS_REVIEW" },
        include: { bankAccount: { select: { bankName: true, accountName: true } } },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
    ]);

  const alertsBySeverity = [...topAlerts]
    .sort(
      (a, b) =>
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .slice(0, 6);
  const alertSubject = (a: (typeof topAlerts)[number]) =>
    a.transaction
      ? { label: a.transaction.description, href: `/transactions/${a.transactionId}` }
      : a.statement
        ? {
            label: a.statement.originalFilename ?? "Statement",
            href: `/statements/${a.statementId}`,
          }
        : a.bankAccount
          ? {
              label: `${a.bankAccount.bankName} · ${a.bankAccount.accountName}`,
              href: `/accounts/${a.bankAccountId}`,
            }
          : null;

  const { total, hasUnconvertible } = totalInBaseCurrency(
    accounts.map((a) => ({
      currentBalance: a.currentBalance,
      currency: a.currency,
    })),
    base,
  );

  const decimals = currencyDecimals(base);
  const toMajor = (minor: bigint) => Number(minor) / 10 ** decimals;
  const cashData = series.map((b) => ({
    label: b.label,
    cash: toMajor(b.cashMinor),
  }));
  const flowData = series.map((b) => ({
    label: b.label,
    credits: toMajor(b.creditsMinor),
    debits: -toMajor(b.debitsMinor), // negative → below the zero baseline
  }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {accounts.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={`Welcome to ${organization.name}`}
          description="Add a bank account and upload a statement to see your multi-bank overview here."
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={`Total cash (${base})`}
              value={formatMoney(total, base)}
              icon={Wallet}
              hint={
                hasUnconvertible
                  ? "Some balances use unsupported currencies and were excluded."
                  : undefined
              }
            />
            <StatCard
              label="Accounts"
              value={String(accounts.length)}
              icon={Landmark}
              href="/accounts"
            />
            <StatCard
              label="Open alerts"
              value={String(openAlerts)}
              icon={BellRing}
              href="/alerts"
              tone={openAlerts > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Needs review"
              value={String(needsReview)}
              icon={FileClock}
              href="/statements"
              tone={needsReview > 0 ? "warning" : "default"}
            />
          </div>

          {series.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Cash position</CardTitle>
                  <CardDescription>
                    Aggregate balance over time ({base}).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <CashPositionChart data={cashData} currency={base} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Credits vs debits</CardTitle>
                  <CardDescription>
                    External money in and out per month ({base}).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <FlowsChart data={flowData} currency={base} />
                </CardContent>
              </Card>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-lg">Open alerts</CardTitle>
                <Link
                  href="/alerts"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  View all →
                </Link>
              </CardHeader>
              <CardContent>
                {alertsBySeverity.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No open alerts — your accounts reconcile cleanly.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {alertsBySeverity.map((a) => {
                      const subject = alertSubject(a);
                      const line = alertDetailLine(a.type, a.detail);
                      return (
                        <li key={a.id} className="py-2.5 first:pt-0 last:pb-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={SEVERITY_VARIANT[a.severity]}>
                              {SEVERITY_LABEL[a.severity]}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {ALERT_TYPE_LABEL[a.type]}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-medium">{a.title}</p>
                          {line && (
                            <p className="text-xs text-muted-foreground">
                              {line}
                            </p>
                          )}
                          {subject && (
                            <Link
                              href={subject.href}
                              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                            >
                              {subject.label} →
                            </Link>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle className="text-lg">Needs review</CardTitle>
                <Link
                  href="/statements"
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                >
                  View all →
                </Link>
              </CardHeader>
              <CardContent>
                {reviewStatements.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No statements waiting on review.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {reviewStatements.map((s) => (
                      <li key={s.id} className="py-2.5 first:pt-0 last:pb-0">
                        <Link
                          href={`/statements/${s.id}`}
                          className="flex items-center justify-between gap-2 hover:underline"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium">
                              {s.originalFilename ?? "Statement"}
                            </span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {s.bankAccount.bankName} ·{" "}
                              {s.bankAccount.accountName}
                            </span>
                          </span>
                          <Badge variant="warning">Review</Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Accounts</CardTitle>
              <CardDescription>
                Current balance per account, across every bank.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {accounts.map((a) => (
                <Link
                  key={a.id}
                  href={`/accounts/${a.id}`}
                  className="rounded-xl border p-4 transition-colors hover:bg-muted/40"
                >
                  <p className="text-sm text-muted-foreground">
                    {a.bankName}
                    {a.last4 ? ` ···· ${a.last4}` : ""}
                  </p>
                  <p className="truncate font-medium">{a.accountName}</p>
                  <p className="mt-2 text-xl font-semibold tabular-nums">
                    {formatMoney(a.currentBalance, a.currency)}
                  </p>
                  <p className="text-xs text-muted-foreground">{a.currency}</p>
                </Link>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
