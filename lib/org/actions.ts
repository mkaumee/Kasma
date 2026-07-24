"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ACTIVE_ORG_COOKIE, requireUser } from "@/lib/auth/session";
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
