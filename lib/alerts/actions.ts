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

export const acknowledgeAlertAction = (id: string) =>
  transition(id, "ACKNOWLEDGED");
export const resolveAlertAction = (id: string) => transition(id, "RESOLVED");
export const dismissAlertAction = (id: string) => transition(id, "DISMISSED");
export const reopenAlertAction = (id: string) => transition(id, "OPEN");
