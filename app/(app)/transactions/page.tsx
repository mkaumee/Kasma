import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";

import { requireOrg } from "@/lib/auth/session";
import {
  fetchLedgerPage,
  type LedgerSort,
  type SortDir,
} from "@/lib/transactions/query";
import type { LedgerQuery } from "@/lib/transactions/url";
import { EmptyState } from "@/components/app/empty-state";
import { LedgerPagination } from "@/components/transactions/ledger-pagination";
import { LedgerTable } from "@/components/transactions/ledger-table";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Transactions" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const SORTS: LedgerSort[] = ["date", "amount", "description"];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { organization } = await requireOrg();
  const sp = await searchParams;

  const query: LedgerQuery = {};
  for (const [key, value] of Object.entries(sp)) {
    query[key] = first(value);
  }

  const sortRaw = first(sp.sort);
  const sort: LedgerSort =
    sortRaw && SORTS.includes(sortRaw as LedgerSort)
      ? (sortRaw as LedgerSort)
      : "date";
  const dir: SortDir = first(sp.dir) === "asc" ? "asc" : "desc";
  const page = Number(first(sp.page)) || 1;

  const ledger = await fetchLedgerPage(organization.id, { page, sort, dir });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Transactions</h1>
        {ledger.total > 0 && (
          <p className="text-sm text-muted-foreground tabular-nums">
            {ledger.total} total
          </p>
        )}
      </div>

      {ledger.total === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title="No transactions yet"
          description="Upload and confirm a bank statement to build your ledger."
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <LedgerTable page={ledger} query={query} />
          <LedgerPagination
            page={ledger.page}
            pageCount={ledger.pageCount}
            total={ledger.total}
            pageSize={ledger.pageSize}
            query={query}
          />
        </Card>
      )}
    </div>
  );
}
