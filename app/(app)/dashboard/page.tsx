import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, FileClock, Landmark, Wallet } from "lucide-react";

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

  const [accounts, openAlerts, needsReview, series] = await Promise.all([
    getAccountBalances(organization.id),
    prisma.alert.count({
      where: { organizationId: organization.id, status: "OPEN" },
    }),
    prisma.statement.count({
      where: { organizationId: organization.id, status: "NEEDS_REVIEW" },
    }),
    getDashboardTimeseries(organization.id, base),
  ]);

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
