"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";

export type NoteState = { error?: string; ok?: boolean };

const addSchema = z.object({
  transactionId: z.string().min(1),
  body: z.string().trim().min(1, "Write something first.").max(2000),
});

export async function addNoteAction(
  input: z.input<typeof addSchema>,
): Promise<NoteState> {
  const ctx = await requirePermission("transactions:write");
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid note." };
  }
  const { transactionId, body } = parsed.data;

  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: ctx.organization.id },
    select: { id: true },
  });
  if (!txn) return { error: "Transaction not found." };

  const note = await prisma.note.create({
    data: {
      organizationId: ctx.organization.id,
      transactionId,
      authorId: ctx.user.id,
      body,
    },
  });
  await prisma.transactionEvent.create({
    data: {
      organizationId: ctx.organization.id,
      transactionId,
      actorId: ctx.user.id,
      kind: "NOTE",
      payload: { noteId: note.id },
    },
  });

  revalidatePath(`/transactions/${transactionId}`);
  return { ok: true };
}

export async function deleteNoteAction(noteId: string): Promise<NoteState> {
  const ctx = await requirePermission("transactions:write");
  const note = await prisma.note.findFirst({
    where: { id: noteId, organizationId: ctx.organization.id },
    select: { id: true, transactionId: true },
  });
  if (!note) return { error: "Note not found." };

  await prisma.note.delete({ where: { id: note.id } });
  revalidatePath(`/transactions/${note.transactionId}`);
  return { ok: true };
}
