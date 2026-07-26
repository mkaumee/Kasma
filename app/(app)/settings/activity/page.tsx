import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { EVENT_KIND_LABEL, fetchAuditPage } from "@/lib/audit/query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Activity" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization, role } = await requireOrg();

  if (!can(role, "org:manage")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Activity</CardTitle>
          <CardDescription>
            You need admin access to view the organization audit log.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const sp = await searchParams;
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Number(pageParam) || 1;
  const { rows, total, pageCount } = await fetchAuditPage(organization.id, page);

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg">Audit log</CardTitle>
          <CardDescription>
            Every change to your transactions, newest first. {total} event
            {total === 1 ? "" : "s"}.
          </CardDescription>
        </div>
        {total > 0 && (
          <Button asChild variant="outline" size="sm">
            <a href="/api/audit/export" download>
              <Download /> Export CSV
            </a>
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            No activity yet.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map((e) => (
              <li
                key={e.id}
                className="flex items-start justify-between gap-4 px-6 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {EVENT_KIND_LABEL[e.kind] ?? e.kind}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.transaction ? (
                      <Link
                        href={`/transactions/${e.transaction.id}`}
                        className="hover:underline"
                      >
                        {e.transaction.description}
                      </Link>
                    ) : (
                      "—"
                    )}
                    {" · "}
                    {e.actor?.name ?? e.actor?.email ?? "System"}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {e.createdAt.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t px-6 py-3 text-sm text-muted-foreground">
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/settings/activity?page=${page - 1}`}
                className="hover:text-foreground hover:underline"
              >
                ← Newer
              </Link>
            )}
            {page < pageCount && (
              <Link
                href={`/settings/activity?page=${page + 1}`}
                className="hover:text-foreground hover:underline"
              >
                Older →
              </Link>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
