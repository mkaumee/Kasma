import type { Metadata } from "next";
import Link from "next/link";
import { BellRing } from "lucide-react";
import type { AlertStatus } from "@prisma/client";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  ALERT_TYPE_LABEL,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  SEVERITY_VARIANT,
  alertDetailLine,
} from "@/lib/alerts/display";
import { cn } from "@/lib/utils";
import { AlertActions } from "@/components/alerts/alert-actions";
import { RunChecksButton } from "@/components/alerts/run-checks-button";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Alerts" };

type SearchParams = Record<string, string | string[] | undefined>;

const TABS: { key: string; label: string; status?: AlertStatus }[] = [
  { key: "open", label: "Open", status: "OPEN" },
  { key: "acknowledged", label: "Acknowledged", status: "ACKNOWLEDGED" },
  { key: "resolved", label: "Resolved", status: "RESOLVED" },
  { key: "dismissed", label: "Dismissed", status: "DISMISSED" },
  { key: "all", label: "All" },
];

function subjectHref(a: {
  transactionId: string | null;
  statementId: string | null;
  bankAccountId: string | null;
}): string | null {
  if (a.transactionId) return `/transactions/${a.transactionId}`;
  if (a.statementId) return `/statements/${a.statementId}`;
  if (a.bankAccountId) return `/accounts/${a.bankAccountId}`;
  return null;
}

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization, role } = await requireOrg();
  const canManage = can(role, "alerts:manage");
  const sp = await searchParams;
  const tabKey = (Array.isArray(sp.status) ? sp.status[0] : sp.status) ?? "open";
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0]!;

  const [alerts, counts] = await Promise.all([
    prisma.alert.findMany({
      where: {
        organizationId: organization.id,
        ...(tab.status ? { status: tab.status } : {}),
      },
      include: {
        bankAccount: { select: { bankName: true, accountName: true } },
        statement: { select: { originalFilename: true } },
        transaction: { select: { description: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.alert.groupBy({
      by: ["status"],
      where: { organizationId: organization.id },
      _count: true,
    }),
  ]);

  const countFor = (status?: AlertStatus) =>
    status
      ? (counts.find((c) => c.status === status)?._count ?? 0)
      : counts.reduce((sum, c) => sum + c._count, 0);

  const sorted = [...alerts].sort(
    (a, b) =>
      SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="text-sm text-muted-foreground">
            {countFor("OPEN")} open · financial-control findings across your
            accounts.
          </p>
        </div>
        {canManage && <RunChecksButton />}
      </div>

      <nav className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => {
          const active = t.key === tab.key;
          return (
            <Link
              key={t.key}
              href={`/alerts?status=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              <span className="ml-1.5 tabular-nums text-muted-foreground">
                {countFor(t.status)}
              </span>
            </Link>
          );
        })}
      </nav>

      {sorted.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title="Nothing here"
          description={
            tab.key === "open"
              ? "No open alerts — your accounts reconcile cleanly."
              : "No alerts in this view."
          }
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((alert) => {
            const href = subjectHref(alert);
            const subject = alert.transaction
              ? alert.transaction.description
              : alert.statement
                ? (alert.statement.originalFilename ?? "Statement")
                : alert.bankAccount
                  ? `${alert.bankAccount.bankName} · ${alert.bankAccount.accountName}`
                  : null;
            const line = alertDetailLine(alert.type, alert.detail);
            return (
              <Card key={alert.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={SEVERITY_VARIANT[alert.severity]}>
                        {SEVERITY_LABEL[alert.severity]}
                      </Badge>
                      <Badge variant="outline">
                        {ALERT_TYPE_LABEL[alert.type]}
                      </Badge>
                      {alert.status !== "OPEN" && (
                        <span className="text-xs uppercase tracking-wide text-muted-foreground">
                          {alert.status.toLowerCase()}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">{alert.title}</p>
                    {line && (
                      <p className="text-sm text-muted-foreground">{line}</p>
                    )}
                    {subject &&
                      (href ? (
                        <Link
                          href={href}
                          className="text-sm text-muted-foreground hover:text-foreground hover:underline"
                        >
                          {subject} →
                        </Link>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {subject}
                        </p>
                      ))}
                  </div>
                  {canManage && (
                    <AlertActions alertId={alert.id} status={alert.status} />
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
