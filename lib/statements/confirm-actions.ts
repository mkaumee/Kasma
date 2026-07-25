"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/guards";
import { enqueueParseStatement } from "@/lib/queue/boss";
import {
  confirmStatement,
  prepareReparse,
  type StatementActionResult,
} from "@/lib/statements/confirm";

export type { StatementActionResult };

export async function confirmStatementAction(
  statementId: string,
): Promise<StatementActionResult> {
  const ctx = await requirePermission("statements:write");
  const result = await confirmStatement(ctx.organization.id, statementId);
  if (result.ok) {
    revalidatePath(`/statements/${statementId}`);
    revalidatePath("/statements");
  }
  return result;
}

export async function reparseStatementAction(
  statementId: string,
): Promise<StatementActionResult> {
  const ctx = await requirePermission("statements:write");
  const result = await prepareReparse(ctx.organization.id, statementId);
  if (result.ok) {
    await enqueueParseStatement({
      statementId,
      organizationId: ctx.organization.id,
    });
    revalidatePath(`/statements/${statementId}`);
    revalidatePath("/statements");
  }
  return result;
}
