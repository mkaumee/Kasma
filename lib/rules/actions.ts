"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/client";
import {
  actionSchema,
  applyCategorizationRules,
  matcherSchema,
} from "@/lib/rules/engine";

export type RuleActionState = { error?: string; ok?: boolean; count?: number };

const saveSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required.").max(80),
  field: matcherSchema.shape.field,
  op: matcherSchema.shape.op,
  value: z.string().trim().min(1, "Match text is required.").max(200),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
  categoryId: z.string().min(1, "Choose a category."),
  priority: z.coerce.number().int().min(0).max(1000).optional(),
});

export async function saveRuleAction(
  input: z.input<typeof saveSchema>,
): Promise<RuleActionState> {
  const ctx = await requirePermission("transactions:write");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid rule." };
  }
  const d = parsed.data;

  const category = await prisma.category.findFirst({
    where: { id: d.categoryId, organizationId: ctx.organization.id },
    select: { id: true },
  });
  if (!category) return { error: "Category not found." };

  const matcher = matcherSchema.parse({
    field: d.field,
    op: d.op,
    value: d.value,
    direction: d.direction,
  });
  const action = actionSchema.parse({
    type: "categorize",
    categoryId: d.categoryId,
  });

  if (d.id) {
    const res = await prisma.rule.updateMany({
      where: {
        id: d.id,
        organizationId: ctx.organization.id,
        type: "CATEGORIZATION",
      },
      data: { name: d.name, matcher, action, priority: d.priority ?? 0 },
    });
    if (res.count === 0) return { error: "Rule not found." };
  } else {
    await prisma.rule.create({
      data: {
        organizationId: ctx.organization.id,
        type: "CATEGORIZATION",
        name: d.name,
        matcher,
        action,
        priority: d.priority ?? 0,
      },
    });
  }

  revalidatePath("/settings/rules");
  return { ok: true };
}

export async function deleteRuleAction(id: string): Promise<RuleActionState> {
  const ctx = await requirePermission("transactions:write");
  const res = await prisma.rule.deleteMany({
    where: { id, organizationId: ctx.organization.id },
  });
  if (res.count === 0) return { error: "Rule not found." };
  revalidatePath("/settings/rules");
  return { ok: true };
}

export async function toggleRuleAction(
  id: string,
  isActive: boolean,
): Promise<RuleActionState> {
  const ctx = await requirePermission("transactions:write");
  const res = await prisma.rule.updateMany({
    where: { id, organizationId: ctx.organization.id },
    data: { isActive },
  });
  if (res.count === 0) return { error: "Rule not found." };
  revalidatePath("/settings/rules");
  return { ok: true };
}

export async function runRulesAction(): Promise<RuleActionState> {
  const ctx = await requirePermission("transactions:write");
  const { count } = await applyCategorizationRules(ctx.organization.id, {
    onlyUncategorized: true,
  });
  revalidatePath("/transactions");
  revalidatePath("/settings/rules");
  return { ok: true, count };
}
