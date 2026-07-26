import { can } from "@/lib/auth/rbac";
import { requireOrg } from "@/lib/auth/session";
import { EVENT_KIND_LABEL } from "@/lib/audit/query";
import { prisma } from "@/lib/db/client";
import { toCsv } from "@/lib/transactions/export";

const MAX_ROWS = 50_000;

export async function GET() {
  const { organization, role } = await requireOrg();
  if (!can(role, "org:manage")) {
    return new Response("Forbidden", { status: 403 });
  }

  const events = await prisma.transactionEvent.findMany({
    where: { organizationId: organization.id },
    include: {
      actor: { select: { name: true, email: true } },
      transaction: { select: { description: true } },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_ROWS,
  });

  const rows = events.map((e) => [
    e.createdAt.toISOString(),
    EVENT_KIND_LABEL[e.kind] ?? e.kind,
    e.transaction?.description ?? "",
    e.actor?.name ?? e.actor?.email ?? "System",
  ]);

  const csv = `﻿${toCsv(["Time", "Event", "Transaction", "Actor"], rows)}`;
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activity-${stamp}.csv"`,
    },
  });
}
