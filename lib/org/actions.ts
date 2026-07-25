"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { ACTIVE_ORG_COOKIE, requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { isCurrencyCode } from "@/lib/money/currency";
import { createOrganization } from "@/lib/org/service";

export type OrgFormState = { error?: string } | undefined;

const schema = z.object({
  name: z.string().trim().min(2, "Enter an organization name.").max(120),
});

export async function createOrganizationAction(
  _prev: OrgFormState,
  formData: FormData,
): Promise<OrgFormState> {
  const user = await requireUser();

  const parsed = schema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  const org = await createOrganization(user.id, parsed.data.name);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, org.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  redirect("/dashboard");
}

export async function switchOrganizationAction(formData: FormData) {
  const user = await requireUser();
  const organizationId = String(formData.get("organizationId") ?? "");

  // Only switch to an org the user actually belongs to.
  const membership = await prisma.membership.findUnique({
    where: {
      userId_organizationId: { userId: user.id, organizationId },
    },
  });

  if (membership) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_ORG_COOKIE, organizationId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
  }

  redirect("/dashboard");
}

export type OrgProfileState = { error?: string; success?: string } | undefined;

const renameSchema = z.object({
  name: z.string().trim().min(2, "Enter an organization name.").max(120),
  baseCurrency: z.string().refine(isCurrencyCode, "Unsupported currency."),
});

export async function updateOrganizationNameAction(
  _prev: OrgProfileState,
  formData: FormData,
): Promise<OrgProfileState> {
  const ctx = await requirePermission("org:manage");

  const parsed = renameSchema.safeParse({
    name: formData.get("name"),
    baseCurrency: formData.get("baseCurrency"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }

  await prisma.organization.update({
    where: { id: ctx.organization.id },
    data: { name: parsed.data.name, baseCurrency: parsed.data.baseCurrency },
  });

  // Refresh the settings page and the shell (org name in the sidebar).
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  return { success: "Saved." };
}
