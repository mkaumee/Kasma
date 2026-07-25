import type { AlertStatus } from "@prisma/client";

import { prisma } from "@/lib/db/client";

export type AlertActionResult = { ok?: boolean; error?: string };

/**
 * Transition an alert's status (org-scoped). Factored out of the server action
 * for testing. RESOLVED records who/when; reopening clears it.
 */
export async function setAlertStatus(
  organizationId: string,
  userId: string | null,
  alertId: string,
  status: AlertStatus,
): Promise<AlertActionResult> {
  const data =
    status === "RESOLVED"
      ? { status, resolvedById: userId, resolvedAt: new Date() }
      : status === "OPEN"
        ? { status, resolvedById: null, resolvedAt: null }
        : { status };

  const res = await prisma.alert.updateMany({
    where: { id: alertId, organizationId },
    data,
  });
  if (res.count === 0) return { error: "Alert not found." };
  return { ok: true };
}
