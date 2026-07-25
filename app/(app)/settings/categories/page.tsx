import type { Metadata } from "next";

import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { CategoryManager } from "@/components/categories/category-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Categories" };

export default async function CategoriesSettingsPage() {
  const { organization, role } = await requireOrg();

  if (!can(role, "transactions:write")) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Categories</CardTitle>
          <CardDescription>
            You need accountant access or higher to manage categories.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const categories = await prisma.category.findMany({
    where: { organizationId: organization.id },
    include: { _count: { select: { transactions: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Categories</CardTitle>
        <CardDescription>
          Organize transactions across all accounts. Deleting a category leaves
          its transactions uncategorized.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <CategoryManager
          categories={categories.map((c) => ({
            id: c.id,
            name: c.name,
            color: c.color,
            count: c._count.transactions,
          }))}
        />
      </CardContent>
    </Card>
  );
}
