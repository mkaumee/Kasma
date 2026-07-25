import { prisma } from "@/lib/db/client";

/**
 * Cross-account internal-transfer matching (Feature 5). Pairs a debit in one
 * account with an equal, opposite credit in another account within a date
 * window, so the same money moving between the company's own accounts isn't
 * double-counted in cash position. Exact minor-amount match keeps this to
 * same-currency transfers (FX transfers are out of scope). Idempotent: only
 * still-unmatched transactions are considered.
 */

type Candidate = {
  id: string;
  bankAccountId: string;
  date: Date;
  amount: bigint;
};

export async function matchInternalTransfers(
  organizationId: string,
  opts: { windowDays?: number } = {},
): Promise<{ pairs: number }> {
  const windowMs = (opts.windowDays ?? 3) * 86_400_000;

  const txns = await prisma.transaction.findMany({
    where: { organizationId, matchedTransferId: null, isInternalTransfer: false },
    select: { id: true, bankAccountId: true, date: true, amount: true },
    orderBy: { date: "asc" },
  });

  const creditsByAmount = new Map<string, Candidate[]>();
  for (const t of txns) {
    if (t.amount > 0n) {
      const key = t.amount.toString();
      const list = creditsByAmount.get(key) ?? [];
      list.push(t);
      creditsByAmount.set(key, list);
    }
  }

  const used = new Set<string>();
  const pairs: [string, string][] = [];

  for (const debit of txns) {
    if (debit.amount >= 0n || used.has(debit.id)) continue;
    const candidates = (creditsByAmount.get((-debit.amount).toString()) ?? [])
      .filter(
        (c) =>
          !used.has(c.id) &&
          c.bankAccountId !== debit.bankAccountId &&
          Math.abs(c.date.getTime() - debit.date.getTime()) <= windowMs,
      )
      .sort(
        (a, b) =>
          Math.abs(a.date.getTime() - debit.date.getTime()) -
          Math.abs(b.date.getTime() - debit.date.getTime()),
      );
    const match = candidates[0];
    if (!match) continue;
    used.add(debit.id);
    used.add(match.id);
    pairs.push([debit.id, match.id]);
  }

  for (const [aId, bId] of pairs) {
    await prisma.$transaction([
      prisma.transaction.update({
        where: { id: aId },
        data: { isInternalTransfer: true, matchedTransferId: bId },
      }),
      prisma.transaction.update({
        where: { id: bId },
        data: { isInternalTransfer: true, matchedTransferId: aId },
      }),
      prisma.transactionEvent.create({
        data: {
          organizationId,
          transactionId: aId,
          kind: "MATCHED",
          payload: { matchedTransferId: bId },
        },
      }),
      prisma.transactionEvent.create({
        data: {
          organizationId,
          transactionId: bId,
          kind: "MATCHED",
          payload: { matchedTransferId: aId },
        },
      }),
    ]);
  }

  return { pairs: pairs.length };
}
