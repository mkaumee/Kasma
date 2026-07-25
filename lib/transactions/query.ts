import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/client";

/** Sortable ledger columns. */
export type LedgerSort = "date" | "amount" | "description";
export type SortDir = "asc" | "desc";

export const LEDGER_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type LedgerParams = {
  page?: number;
  pageSize?: number;
  sort?: LedgerSort;
  dir?: SortDir;
};

function orderByFor(
  sort: LedgerSort,
  dir: SortDir,
): Prisma.TransactionOrderByWithRelationInput[] {
  switch (sort) {
    case "amount":
      return [{ amount: dir }, { createdAt: "desc" }];
    case "description":
      return [{ description: dir }, { date: "desc" }];
    case "date":
    default:
      return [{ date: dir }, { createdAt: dir }];
  }
}

export type LedgerRow = Prisma.TransactionGetPayload<{
  include: {
    bankAccount: { select: { bankName: true; accountName: true } };
    category: { select: { name: true; color: true } };
    _count: { select: { attachments: true; notes: true } };
  };
}>;

export type LedgerPage = {
  rows: LedgerRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  sort: LedgerSort;
  dir: SortDir;
};

/**
 * Fetch one page of the org's ledger. The `where` is provided by the caller so
 * filters (Phase 8.2) compose cleanly; org scoping is always enforced here.
 */
export async function fetchLedgerPage(
  organizationId: string,
  params: LedgerParams = {},
  where: Prisma.TransactionWhereInput = {},
): Promise<LedgerPage> {
  const page = Math.max(1, Math.floor(params.page ?? 1));
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Math.floor(params.pageSize ?? LEDGER_PAGE_SIZE)),
  );
  const sort = params.sort ?? "date";
  const dir = params.dir ?? "desc";

  const scopedWhere: Prisma.TransactionWhereInput = {
    ...where,
    organizationId,
  };

  const [rows, total] = await Promise.all([
    prisma.transaction.findMany({
      where: scopedWhere,
      orderBy: orderByFor(sort, dir),
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        bankAccount: { select: { bankName: true, accountName: true } },
        category: { select: { name: true, color: true } },
        _count: { select: { attachments: true, notes: true } },
      },
    }),
    prisma.transaction.count({ where: scopedWhere }),
  ]);

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    sort,
    dir,
  };
}
