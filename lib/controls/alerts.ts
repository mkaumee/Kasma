import {
  Prisma,
  type AlertSeverity,
  type AlertType,
  type PrismaClient,
} from "@prisma/client";

import { prisma } from "@/lib/db/client";

/**
 * Alert helpers shared by every financial-control detector. Alerts are
 * deduplicated per (organizationId, dedupeKey): the same underlying issue
 * updates in place rather than piling up. A resolved/dismissed alert is never
 * silently re-opened — its status is preserved on update.
 */

type Db = PrismaClient | Prisma.TransactionClient;

export type AlertInput = {
  organizationId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  detail?: Prisma.InputJsonValue;
  dedupeKey: string;
  bankAccountId?: string | null;
  statementId?: string | null;
  transactionId?: string | null;
};

export async function upsertAlert(input: AlertInput, db: Db = prisma): Promise<void> {
  const detail = input.detail ?? Prisma.JsonNull;
  await db.alert.upsert({
    where: {
      organizationId_dedupeKey: {
        organizationId: input.organizationId,
        dedupeKey: input.dedupeKey,
      },
    },
    create: {
      organizationId: input.organizationId,
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail,
      dedupeKey: input.dedupeKey,
      bankAccountId: input.bankAccountId ?? null,
      statementId: input.statementId ?? null,
      transactionId: input.transactionId ?? null,
    },
    // Refresh the content but never touch `status` — a user's
    // resolve/dismiss decision stands until the issue is auto-resolved.
    update: {
      type: input.type,
      severity: input.severity,
      title: input.title,
      detail,
      bankAccountId: input.bankAccountId ?? null,
      statementId: input.statementId ?? null,
      transactionId: input.transactionId ?? null,
    },
  });
}

/** System-resolve an alert whose underlying issue no longer holds. */
export async function autoResolveAlert(
  organizationId: string,
  dedupeKey: string,
  db: Db = prisma,
): Promise<void> {
  await db.alert.updateMany({
    where: {
      organizationId,
      dedupeKey,
      status: { in: ["OPEN", "ACKNOWLEDGED"] },
    },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
}

/** Map an absolute money delta (minor units) to a severity band. */
export function severityForAmount(minor: bigint): AlertSeverity {
  const abs = minor < 0n ? -minor : minor;
  if (abs < 100n) return "LOW"; // < 1.00
  if (abs < 10_000n) return "MEDIUM"; // < 100.00
  if (abs < 100_000n) return "HIGH"; // < 1,000.00
  return "CRITICAL";
}
