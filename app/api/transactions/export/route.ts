import ExcelJS from "exceljs";

import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import {
  ledgerWhere,
  parseLedgerFilters,
} from "@/lib/transactions/filters";
import {
  EXPORT_HEADERS,
  toCsv,
  transactionToRow,
} from "@/lib/transactions/export";

/** Hard cap so an export can't pull an unbounded result set. */
const MAX_EXPORT_ROWS = 50_000;

export async function GET(request: Request) {
  const { organization } = await requireOrg();

  const url = new URL(request.url);
  const query: Record<string, string | undefined> = {};
  for (const [key, value] of url.searchParams.entries()) query[key] = value;
  const format = query.format === "xlsx" ? "xlsx" : "csv";

  const where = {
    ...ledgerWhere(parseLedgerFilters(query)),
    organizationId: organization.id,
  };

  const txns = await prisma.transaction.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: MAX_EXPORT_ROWS,
    include: {
      bankAccount: { select: { bankName: true, accountName: true } },
      category: { select: { name: true } },
    },
  });

  const rows = txns.map(transactionToRow);
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Transactions");
    sheet.addRow(EXPORT_HEADERS);
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) sheet.addRow(row);
    const buffer = await workbook.xlsx.writeBuffer();
    return new Response(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="transactions-${stamp}.xlsx"`,
      },
    });
  }

  // UTF-8 BOM so Excel opens the CSV with correct encoding.
  const csv = `﻿${toCsv(EXPORT_HEADERS, rows)}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="transactions-${stamp}.csv"`,
    },
  });
}
