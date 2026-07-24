"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requirePermission } from "@/lib/auth/guards";
import { ACTIVE_ORG_COOKIE, requireUser } from "@/lib/auth/session";
import {
  acceptInvitation,
  createInvitation,
  revokeInvitation,
} from "@/lib/org/invitations";

const inviteSchema = z.object({
  email: z.email("Enter a valid email.").transform((v) => v.toLowerCase()),
  role: z.enum(["ADMIN", "ACCOUNTANT", "VIEWER"]),
});

export type InviteFormState = { error?: string; success?: string } | undefined;

export async function inviteMemberAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const ctx = await requirePermission("members:manage");

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and role." };
  }

  await createInvitation({
    organizationId: ctx.organization.id,
    email: parsed.data.email,
    role: parsed.data.role,
    invitedById: ctx.user.id,
  });

  revalidatePath("/settings/members");
  return { success: `Invitation ready for ${parsed.data.email}.` };
}

export async function revokeInvitationAction(formData: FormData) {
  const ctx = await requirePermission("members:manage");
  const id = String(formData.get("id") ?? "");
  if (id) {
    await revokeInvitation(ctx.organization.id, id);
    revalidatePath("/settings/members");
  }
}

export async function acceptInvitationAction(formData: FormData) {
  const user = await requireUser();
  const token = String(formData.get("token") ?? "");

  const result = await acceptInvitation(token, user);
  if (!result.ok) {
    redirect(`/invite/${token}?error=${result.reason}`);
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_ORG_COOKIE, result.organizationId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
  redirect("/dashboard");
}
