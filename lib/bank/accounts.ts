import type { AccountType } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import { tenantDb } from "@/lib/db/tenant";

export type AccountWithBalance = {
  id: string;
  bankName: string;
  accountName: string;
  last4: string | null;
  currency: string;
  type: AccountType;
  openingBalance: bigint;
  currentBalance: bigint;
  isActive: boolean;
};

/**
 * List an org's accounts with their current balance
 * (opening balance + the sum of all confirmed transactions).
 */
export async function listAccountsWithBalances(
  organizationId: string,
): Promise<AccountWithBalance[]> {
  const accounts = await tenantDb(organizationId).bankAccount.findMany({
    orderBy: { createdAt: "asc" },
  });

  const sums = await prisma.transaction.groupBy({
    by: ["bankAccountId"],
    where: { organizationId },
    _sum: { amount: true },
  });
  const sumById = new Map(
    sums.map((s) => [s.bankAccountId, s._sum.amount ?? 0n]),
  );

  return accounts.map((a) => ({
    id: a.id,
    bankName: a.bankName,
    accountName: a.accountName,
    last4: a.last4,
    currency: a.currency,
    type: a.type,
    openingBalance: a.openingBalance,
    currentBalance: a.openingBalance + (sumById.get(a.id) ?? 0n),
    isActive: a.isActive,
  }));
}
