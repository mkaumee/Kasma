import type { Prisma, TransactionEventKind } from "@prisma/client";

import { prisma } from "@/lib/db/client";

/** Org-wide audit log built from the immutable TransactionEvent stream. */

export const AUDIT_PAGE_SIZE = 50;

export const EVENT_KIND_LABEL: Record<TransactionEventKind, string> = {
  CREATED: "Transaction created",
  EDITED: "Transaction edited",
  CATEGORIZED: "Categorized",
  EVIDENCE_ADDED: "Evidence added",
  VERIFIED: "Verification changed",
  MATCHED: "Transfer matched",
  NOTE: "Note added",
};

export type AuditRow = Prisma.TransactionEventGetPayload<{
  include: {
    actor: { select: { name: true; email: true } };
    transaction: { select: { id: true; description: true } };
  };
}>;

export async function fetchAuditPage(
  organizationId: string,
  page = 1,
  pageSize = AUDIT_PAGE_SIZE,
): Promise<{
  rows: AuditRow[];
  total: number;
  page: number;
  pageCount: number;
}> {
  const safePage = Math.max(1, Math.floor(page));
  const [rows, total] = await Promise.all([
    prisma.transactionEvent.findMany({
      where: { organizationId },
      include: {
        actor: { select: { name: true, email: true } },
        transaction: { select: { id: true, description: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transactionEvent.count({ where: { organizationId } }),
  ]);
  return {
    rows,
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}
