"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { tenantDb } from "@/lib/db/tenant";
import { enqueueParseStatement } from "@/lib/queue/boss";
import { storeUpload, UploadError } from "@/lib/storage/uploads";

export type UploadState = { error?: string; ok?: boolean } | undefined;

const schema = z.object({
  bankAccountId: z.string().min(1, "Choose an account."),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function uploadStatementAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const ctx = await requirePermission("statements:write");

  const parsed = schema.safeParse({
    bankAccountId: formData.get("bankAccountId"),
    periodStart: formData.get("periodStart") || undefined,
    periodEnd: formData.get("periodEnd") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid form." };
  }

  const account = await tenantDb(ctx.organization.id).bankAccount.findFirst({
    where: { id: parsed.data.bankAccountId },
  });
  if (!account) return { error: "Account not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to upload." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let stored;
  try {
    stored = await storeUpload(ctx.organization.id, "statements", {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      bytes,
    });
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    throw error;
  }

  const statement = await prisma.statement.create({
    data: {
      organizationId: ctx.organization.id,
      bankAccountId: account.id,
      currency: account.currency,
      status: "QUEUED",
      source: "UPLOAD",
      fileKey: stored.key,
      fileHash: stored.hash,
      originalFilename: stored.filename,
      periodStart: parseDate(parsed.data.periodStart),
      periodEnd: parseDate(parsed.data.periodEnd),
      importJobs: {
        create: { organizationId: ctx.organization.id, status: "QUEUED" },
      },
    },
  });

  await enqueueParseStatement({
    statementId: statement.id,
    organizationId: ctx.organization.id,
  });

  revalidatePath("/statements");
  return { ok: true };
}
