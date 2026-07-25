import { z } from "zod";

import { prisma } from "@/lib/db/client";

/**
 * Auto-categorization rules engine. A CATEGORIZATION rule matches a
 * transaction on a text field (optionally constrained by direction) and
 * assigns a category. Rules are applied on import and on demand; the
 * highest-priority matching rule wins and manual categories are preserved by
 * default (only uncategorized rows are touched).
 */

export const matcherSchema = z.object({
  field: z.enum(["description", "counterparty", "reference"]),
  op: z.enum(["contains", "equals", "startsWith"]),
  value: z.string().min(1).max(200),
  direction: z.enum(["CREDIT", "DEBIT"]).optional(),
});
export type RuleMatcher = z.infer<typeof matcherSchema>;

export const actionSchema = z.object({
  type: z.literal("categorize"),
  categoryId: z.string().min(1),
});
export type RuleAction = z.infer<typeof actionSchema>;

export type MatchableTransaction = {
  description: string | null;
  counterparty: string | null;
  reference: string | null;
  direction: "CREDIT" | "DEBIT";
};

function textMatch(
  field: string | null,
  op: RuleMatcher["op"],
  value: string,
): boolean {
  if (field == null) return false;
  const f = field.toLowerCase();
  const v = value.toLowerCase();
  if (op === "contains") return f.includes(v);
  if (op === "equals") return f === v;
  if (op === "startsWith") return f.startsWith(v);
  return false;
}

/** Pure: does a transaction satisfy a matcher? */
export function matchesRule(
  txn: MatchableTransaction,
  matcher: RuleMatcher,
): boolean {
  const field =
    matcher.field === "description"
      ? txn.description
      : matcher.field === "counterparty"
        ? txn.counterparty
        : txn.reference;
  if (!textMatch(field, matcher.op, matcher.value)) return false;
  if (matcher.direction && txn.direction !== matcher.direction) return false;
  return true;
}

export type ApplyRulesOptions = {
  /** Restrict to specific transactions. */
  transactionIds?: string[];
  /** Restrict to one statement's transactions. */
  statementId?: string;
  /** When false, re-categorize even already-categorized rows (default true). */
  onlyUncategorized?: boolean;
};

/**
 * Apply the org's active categorization rules. Returns how many transactions
 * were (re)categorized. Records a CATEGORIZED audit event per change.
 */
export async function applyCategorizationRules(
  organizationId: string,
  options: ApplyRulesOptions = {},
): Promise<{ count: number }> {
  const rules = await prisma.rule.findMany({
    where: { organizationId, type: "CATEGORIZATION", isActive: true },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });
  if (rules.length === 0) return { count: 0 };

  const validCategories = new Set(
    (
      await prisma.category.findMany({
        where: { organizationId },
        select: { id: true },
      })
    ).map((c) => c.id),
  );

  const compiled = rules
    .map((r) => ({
      matcher: matcherSchema.safeParse(r.matcher),
      action: actionSchema.safeParse(r.action),
    }))
    .filter(
      (r) =>
        r.matcher.success &&
        r.action.success &&
        validCategories.has(r.action.data.categoryId),
    )
    .map((r) => ({ matcher: r.matcher.data!, action: r.action.data! }));
  if (compiled.length === 0) return { count: 0 };

  const where: Record<string, unknown> = { organizationId };
  if (options.transactionIds) where.id = { in: options.transactionIds };
  if (options.statementId) where.statementId = options.statementId;
  if (options.onlyUncategorized !== false) where.categoryId = null;

  const txns = await prisma.transaction.findMany({
    where,
    select: {
      id: true,
      description: true,
      counterparty: true,
      reference: true,
      direction: true,
    },
  });

  const byCategory = new Map<string, string[]>();
  for (const t of txns) {
    const rule = compiled.find((r) => matchesRule(t, r.matcher));
    if (!rule) continue;
    const list = byCategory.get(rule.action.categoryId) ?? [];
    list.push(t.id);
    byCategory.set(rule.action.categoryId, list);
  }
  if (byCategory.size === 0) return { count: 0 };

  let count = 0;
  await prisma.$transaction(async (tx) => {
    for (const [categoryId, ids] of byCategory) {
      await tx.transaction.updateMany({
        where: { id: { in: ids }, organizationId },
        data: { categoryId },
      });
      await tx.transactionEvent.createMany({
        data: ids.map((transactionId) => ({
          organizationId,
          transactionId,
          kind: "CATEGORIZED" as const,
          payload: { categoryId, rule: true },
        })),
      });
      count += ids.length;
    }
  });

  return { count };
}
