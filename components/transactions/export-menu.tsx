"use client";

import { Download } from "lucide-react";

import { buildLedgerHref, type LedgerQuery } from "@/lib/transactions/url";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Export the current filtered ledger as CSV or Excel. */
export function ExportMenu({ query }: { query: LedgerQuery }) {
  const href = (format: "csv" | "xlsx") =>
    `/api/transactions/export${buildLedgerHref(query, {
      format,
      page: undefined,
      pageSize: undefined,
    })}`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <a href={href("csv")} download>
            Export as CSV
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={href("xlsx")} download>
            Export as Excel
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
