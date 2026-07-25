"use server";

import { revalidatePath } from "next/cache";
import { AttachmentKind } from "@prisma/client";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import { getStorage } from "@/lib/storage";
import { storeUpload, UploadError } from "@/lib/storage/uploads";

export type EvidenceState = { error?: string; ok?: boolean } | undefined;

const KINDS = new Set<AttachmentKind>(["RECEIPT", "INVOICE", "DOCUMENT"]);

const uploadSchema = z.object({
  transactionId: z.string().min(1),
  kind: z
    .string()
    .transform((k) => k.toUpperCase())
    .refine((k) => KINDS.has(k as AttachmentKind), "Invalid kind.")
    .transform((k) => k as AttachmentKind),
});

export async function uploadEvidenceAction(
  _prev: EvidenceState,
  formData: FormData,
): Promise<EvidenceState> {
  const ctx = await requirePermission("transactions:write");

  const parsed = uploadSchema.safeParse({
    transactionId: formData.get("transactionId"),
    kind: formData.get("kind") ?? "DOCUMENT",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid request." };
  }
  const { transactionId, kind } = parsed.data;

  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: ctx.organization.id },
    select: { id: true },
  });
  if (!txn) return { error: "Transaction not found." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a file to attach." };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  let stored;
  try {
    stored = await storeUpload(ctx.organization.id, "evidence", {
      filename: file.name,
      contentType: file.type || "application/octet-stream",
      bytes,
    });
  } catch (error) {
    if (error instanceof UploadError) return { error: error.message };
    throw error;
  }

  const attachment = await prisma.attachment.create({
    data: {
      organizationId: ctx.organization.id,
      transactionId,
      kind,
      fileKey: stored.key,
      originalFilename: stored.filename,
      contentType: stored.contentType,
      size: stored.size,
      uploadedById: ctx.user.id,
    },
  });

  await prisma.transactionEvent.create({
    data: {
      organizationId: ctx.organization.id,
      transactionId,
      actorId: ctx.user.id,
      kind: "EVIDENCE_ADDED",
      payload: { attachmentId: attachment.id, filename: stored.filename, kind },
    },
  });

  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
  return { ok: true };
}

export async function deleteEvidenceAction(
  attachmentId: string,
): Promise<{ error?: string; ok?: boolean }> {
  const ctx = await requirePermission("transactions:write");

  const attachment = await prisma.attachment.findFirst({
    where: { id: attachmentId, organizationId: ctx.organization.id },
    select: { id: true, fileKey: true, transactionId: true },
  });
  if (!attachment) return { error: "Attachment not found." };

  // Remove the stored object first; ignore storage errors so the row can still
  // be cleared even if the object is already gone.
  await getStorage()
    .delete(attachment.fileKey)
    .catch(() => {});
  await prisma.attachment.delete({ where: { id: attachment.id } });

  if (attachment.transactionId) {
    revalidatePath(`/transactions/${attachment.transactionId}`);
  }
  revalidatePath("/transactions");
  return { ok: true };
}
