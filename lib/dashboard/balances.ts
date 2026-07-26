import { prisma } from "@/lib/db/client";

/**
 * Current balance = opening balance + Σ(transaction amounts) per account.
 * The pure mapper is separated from the query so it can be unit-tested.
 */

export function applyBalances<T extends { id: string; openingBalance: bigint }>(
  accounts: T[],
  sumByAccount: Map<string, bigint>,
): (T & { currentBalance: bigint })[] {
  return accounts.map((a) => ({
    ...a,
    currentBalance: a.openingBalance + (sumByAccount.get(a.id) ?? 0n),
  }));
}

export async function getAccountBalances(organizationId: string) {
  const [accounts, sums] = await Promise.all([
    prisma.bankAccount.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.transaction.groupBy({
      by: ["bankAccountId"],
      where: { organizationId },
      _sum: { amount: true },
    }),
  ]);
  const sumByAccount = new Map(
    sums.map((s) => [s.bankAccountId, s._sum.amount ?? 0n]),
  );
  return applyBalances(accounts, sumByAccount);
}
