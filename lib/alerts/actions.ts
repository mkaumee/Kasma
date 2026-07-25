"use server";

import { revalidatePath } from "next/cache";
import type { AlertStatus } from "@prisma/client";

import { requirePermission } from "@/lib/auth/guards";
import { setAlertStatus, type AlertActionResult } from "@/lib/alerts/service";

async function transition(
  alertId: string,
  status: AlertStatus,
): Promise<AlertActionResult> {
  const ctx = await requirePermission("alerts:manage");
  const result = await setAlertStatus(
    ctx.organization.id,
    ctx.user.id,
    alertId,
    status,
  );
  if (result.ok) revalidatePath("/alerts");
  return result;
}

export async function acknowledgeAlertAction(id: string) {
  return transition(id, "ACKNOWLEDGED");
}
export async function resolveAlertAction(id: string) {
  return transition(id, "RESOLVED");
}
export async function dismissAlertAction(id: string) {
  return transition(id, "DISMISSED");
}
export async function reopenAlertAction(id: string) {
  return transition(id, "OPEN");
}
