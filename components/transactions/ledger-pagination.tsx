import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { buildLedgerHref, type LedgerQuery } from "@/lib/transactions/url";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export function LedgerPagination({
  page,
  pageCount,
  total,
  pageSize,
  query,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  query: LedgerQuery;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const prevDisabled = page <= 1;
  const nextDisabled = page >= pageCount;

  const linkCls = cn(buttonVariants({ variant: "outline", size: "sm" }));
  const disabledCls = cn(linkCls, "pointer-events-none opacity-50");

  return (
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
      <span className="tabular-nums">
        {total === 0 ? "No transactions" : `${from}–${to} of ${total}`}
      </span>
      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <span className={disabledCls} aria-disabled>
            <ChevronLeft /> Previous
          </span>
        ) : (
          <Link
            href={buildLedgerHref(query, { page: page - 1 })}
            className={linkCls}
          >
            <ChevronLeft /> Previous
          </Link>
        )}
        <span className="px-1 tabular-nums">
          Page {page} of {pageCount}
        </span>
        {nextDisabled ? (
          <span className={disabledCls} aria-disabled>
            Next <ChevronRight />
          </span>
        ) : (
          <Link
            href={buildLedgerHref(query, { page: page + 1 })}
            className={linkCls}
          >
            Next <ChevronRight />
          </Link>
        )}
      </div>
    </div>
  );
}
