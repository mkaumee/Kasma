import { Prisma, type PrismaClient, type StatementTemplate } from "@prisma/client";

import { prisma } from "@/lib/db/client";
import type { ParseResult } from "@/lib/extraction/types";

/**
 * Saved per-bank templates. A template is a structural fingerprint of a
 * recurring statement format (parser + detected column layout). The first time
 * a format is seen a template is created, untrusted; once a human confirms a
 * statement produced by it, it becomes `trusted` and future fully-reconciled
 * uploads of the same format may auto-confirm.
 *
 * Only tabular parses (with a detected column map) get a template. LLM and
 * unknown extractions have no stable structural signature, so they always need
 * review.
 */

/**
 * Structural signature for a parse result, or null when there is no stable
 * column layout to fingerprint (e.g. the Claude fallback).
 */
export function computeSignature(parseResult: ParseResult): string | null {
  const cols = parseResult.meta?.columns;
  if (!cols || typeof cols !== "object" || Array.isArray(cols)) return null;
  const entries = Object.entries(cols as Record<string, unknown>)
    .filter(([, v]) => typeof v === "number")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v as number}`);
  if (entries.length === 0) return null;
  return `${parseResult.parser}|${entries.join(",")}`;
}

/** A Prisma client or an interactive-transaction client. */
type Db = PrismaClient | Prisma.TransactionClient;

export async function findTemplate(
  organizationId: string,
  signature: string,
  db: Db = prisma,
): Promise<StatementTemplate | null> {
  return db.statementTemplate.findUnique({
    where: { organizationId_signature: { organizationId, signature } },
  });
}

/**
 * Record that a statement matched this format: create the template on first
 * sight, or bump its usage. Returns the template id so the statement can link
 * to it. Preserves the `trusted` flag on updates.
 */
export async function recordTemplate(
  params: {
    organizationId: string;
    bankAccountId: string;
    signature: string;
    parserUsed: string;
    columnMap: Prisma.InputJsonValue | null;
  },
  db: Db = prisma,
): Promise<string> {
  const { organizationId, bankAccountId, signature, parserUsed, columnMap } =
    params;
  const template = await db.statementTemplate.upsert({
    where: { organizationId_signature: { organizationId, signature } },
    create: {
      organizationId,
      bankAccountId,
      signature,
      parserUsed,
      columnMap: columnMap ?? Prisma.JsonNull,
    },
    update: {
      timesSeen: { increment: 1 },
      lastUsedAt: new Date(),
      parserUsed,
      bankAccountId,
      columnMap: columnMap ?? Prisma.JsonNull,
    },
  });
  return template.id;
}

/**
 * Mark a statement's template as trusted, called when a human confirms a
 * statement. No-op if the statement matched no template.
 */
export async function markTemplateTrustedForStatement(
  statementId: string,
  db: Db = prisma,
): Promise<void> {
  const statement = await db.statement.findUnique({
    where: { id: statementId },
    select: { statementTemplateId: true },
  });
  if (!statement?.statementTemplateId) return;
  await db.statementTemplate.update({
    where: { id: statement.statementTemplateId },
    data: { trusted: true },
  });
}
