import type { Metadata } from "next";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { actionSchema, matcherSchema } from "@/lib/rules/engine";
import { RuleManager, type RuleItem } from "@/components/rules/rule-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Rules" };

export default async function RulesSettingsPage() {
  const { organization, role } = await requireOrg();

  if (!can(role, "transactions:write")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Rules</CardTitle>
          <CardDescription>
            You need accountant access or higher to manage rules.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const [rules, categories] = await Promise.all([
    prisma.rule.findMany({
      where: { organizationId: organization.id, type: "CATEGORIZATION" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.category.findMany({
      where: { organizationId: organization.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  const items: RuleItem[] = rules.map((r) => {
    const m = matcherSchema.safeParse(r.matcher);
    const a = actionSchema.safeParse(r.action);
    return {
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      field: m.success ? m.data.field : "description",
      op: m.success ? m.data.op : "contains",
      value: m.success ? m.data.value : "",
      direction: m.success ? (m.data.direction ?? null) : null,
      categoryName: a.success
        ? (categoryName.get(a.data.categoryId) ?? null)
        : null,
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Auto-categorization rules</CardTitle>
        <CardDescription>
          Automatically assign categories to matching transactions on import.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RuleManager rules={items} categories={categories} />
      </CardContent>
    </Card>
  );
}
