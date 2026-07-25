"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { applyBulkCategorize } from "@/lib/categories/bulk";
import { prisma } from "@/lib/db/client";

export type ActionState = { error?: string; ok?: boolean };

const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #4f46e5")
  .optional();

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required.").max(60),
  color: hexColor,
});

export async function saveCategoryAction(
  input: z.input<typeof upsertSchema>,
): Promise<ActionState> {
  const ctx = await requirePermission("transactions:write");
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid category." };
  }
  const { id, name, color } = parsed.data;

  try {
    if (id) {
      // Scope the update to the org via updateMany (avoids cross-tenant writes).
      const res = await prisma.category.updateMany({
        where: { id, organizationId: ctx.organization.id },
        data: { name, color: color ?? null },
      });
      if (res.count === 0) return { error: "Category not found." };
    } else {
      await prisma.category.create({
        data: { organizationId: ctx.organization.id, name, color: color ?? null },
      });
    }
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return { error: "A category with that name already exists." };
    }
    throw error;
  }

  revalidatePath("/settings/categories");
  revalidatePath("/transactions");
  return { ok: true };
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  const ctx = await requirePermission("transactions:write");
  // onDelete: SetNull on Transaction.categoryId, so transactions are preserved.
  const res = await prisma.category.deleteMany({
    where: { id, organizationId: ctx.organization.id },
  });
  if (res.count === 0) return { error: "Category not found." };
  revalidatePath("/settings/categories");
  revalidatePath("/transactions");
  return { ok: true };
}

const assignSchema = z.object({
  transactionId: z.string().min(1),
  categoryId: z.string().nullable(),
});

export async function assignCategoryAction(
  input: z.input<typeof assignSchema>,
): Promise<ActionState> {
  const ctx = await requirePermission("transactions:write");
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const { transactionId, categoryId } = parsed.data;

  // Verify both the transaction and the category belong to the org.
  const txn = await prisma.transaction.findFirst({
    where: { id: transactionId, organizationId: ctx.organization.id },
    select: { id: true },
  });
  if (!txn) return { error: "Transaction not found." };
  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, organizationId: ctx.organization.id },
      select: { id: true },
    });
    if (!cat) return { error: "Category not found." };
  }

  await prisma.$transaction([
    prisma.transaction.update({
      where: { id: transactionId },
      data: { categoryId },
    }),
    prisma.transactionEvent.create({
      data: {
        organizationId: ctx.organization.id,
        transactionId,
        actorId: ctx.user.id,
        kind: "CATEGORIZED",
        payload: { categoryId },
      },
    }),
  ]);

  revalidatePath(`/transactions/${transactionId}`);
  revalidatePath("/transactions");
  return { ok: true };
}

const bulkSchema = z.object({
  query: z.record(z.string(), z.string().optional()),
  categoryId: z.string().nullable(),
});

export async function bulkCategorizeAction(
  input: z.input<typeof bulkSchema>,
): Promise<ActionState & { count?: number }> {
  const ctx = await requirePermission("transactions:write");
  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid request." };
  const { query, categoryId } = parsed.data;

  if (categoryId) {
    const cat = await prisma.category.findFirst({
      where: { id: categoryId, organizationId: ctx.organization.id },
      select: { id: true },
    });
    if (!cat) return { error: "Category not found." };
  }

  const { count } = await applyBulkCategorize(
    ctx.organization.id,
    ctx.user.id,
    query,
    categoryId,
  );

  revalidatePath("/transactions");
  return { ok: true, count };
}
