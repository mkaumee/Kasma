"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import type { LedgerQuery } from "@/lib/transactions/url";
import { applyBulkVerify } from "@/lib/verification/bulk";

export type VerificationState = { error?: string; ok?: boolean; count?: number };

const schema = z.object({
  transactionId: z.string().min(1),
  status: z.enum(["UNVERIFIED", "VERIFIED", "DISPUTED"]),
});

/** Set a transaction's verification status, recording who/when in the audit log. */
export async function setVerificationAction(
  input: z.input<typeof schema>,
): Promise<VerificationState> {
  const ctx = await requirePermission("transactions:write");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const { transactionId, status } = parsed.data;

  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: ctx.organization.id },
    select: { id: true },
  });
  if (!txn) return { error: "Transaction not found." };

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: { verificationStatus: status },
    }),
    prisma.transactionEvent.create({
      data: {
        organizationId: ctx.organization.id,
        transactionId,
        actorId: ctx.user.id,
        kind: "VERIFIED",
        payload: { status },
      },
    }),
  ]);

  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
  return { ok: true };
}

const bulkSchema = z.object({
  query: z.record(z.string(), z.string().optional()),
  status: z.enum(["UNVERIFIED", "VERIFIED", "DISPUTED"]),
});

/** Apply a verification status to every transaction matching the filters. */
export async function bulkVerifyAction(
  input: z.input<typeof bulkSchema>,
): Promise<VerificationState> {
  const ctx = await requirePermission("transactions:write");
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };

  const { count } = await applyBulkVerify(
    ctx.organization.id,
    ctx.user.id,
    parsed.data.query as LedgerQuery,
    parsed.data.status,
  );
  revalidatePath("/transactions");
  return { ok: true, count };
}
