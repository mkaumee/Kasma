"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/guards";
import { runControlsForOrg } from "@/lib/controls/run";

export async function runControlsAction(): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requirePermission("alerts:manage");
  await runControlsForOrg(ctx.organization.id);
  revalidatePath("/alerts");
  revalidatePath("/dashboard");
  return { ok: true };
}
