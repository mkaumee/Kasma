"use server";

import { revalidatePath } from "next/cache";

import { requirePermission } from "@/lib/auth/guards";
import {
  applyStatementRowEdits,
  type ReviewInput,
  type ReviewResult,
} from "@/lib/statements/review";

export type SaveRowsInput = ReviewInput;
export type SaveRowsState = ReviewResult;

/**
 * Persist a reviewer's edits to a statement's extracted rows. Thin auth wrapper
 * over {@link applyStatementRowEdits}.
 */
export async function saveStatementRowsAction(
  input: SaveRowsInput,
): Promise<SaveRowsState> {
  const ctx = await requirePermission("transactions:write");
  const result = await applyStatementRowEdits(
    ctx.organization.id,
    ctx.user.id,
    input,
  );
  if (result.ok) {
    revalidatePath(`/statements/${input.statementId}`);
    revalidatePath("/statements");
  }
  return result;
}
