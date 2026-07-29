import { z } from "zod";

import { parseStatementDate } from "@/lib/extraction/dates";
import { detectKind } from "@/lib/extraction/detect";
import { redactAccountNumbers } from "@/lib/extraction/llm-schema";
import { pickProvider } from "@/lib/extraction/llm";
import {
  parseSignedMoney,
  type NormalizedStatement,
} from "@/lib/extraction/normalize";
import type { ParseInput } from "@/lib/extraction/types";
import { env } from "@/lib/env";

/**
 * Statement-metadata pass — the fix for "no running balance to verify against".
 *
 * The deterministic parsers (CSV/XLSX/digital-PDF) read transaction *rows* but
 * never the summary block where a bank prints "Opening Balance" / "Closing
 * Balance" and the statement period. Without those the validation engine has
 * nothing independent to check the rows against, so every such statement is
 * routed to NEEDS_REVIEW no matter how cleanly it parsed.
 *
 * This pass asks the LLM for that metadata *only* — no transaction rows — using
 * a small slice of the document (its head and tail, where the summary lives).
 * It is cheap, and the pipeline only invokes it when a balance is actually
 * missing, so most statements never trigger it.
 *
 * The values it returns count as *read off the statement*, not derived from the
 * rows, so unlike row-inference they are legitimate independent evidence for
 * the closing check (see the circularity guard in validate.ts).
 */

/** Characters taken from each end of the document. Summary blocks are small. */
const SLICE_CHARS = 8_000;

/** Metadata is a handful of short fields; no need for a large output budget. */
const MAX_OUTPUT_TOKENS = 1_500;

/** Minimum extracted characters for a PDF's text layer to be usable. */
const DIGITAL_TEXT_THRESHOLD = 40;

const MetadataSchema = z.object({
  openingBalance: z.string().nullable(),
  closingBalance: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  currency: z.string().nullable(),
  bankName: z.string().nullable(),
  accountLast4: z.string().nullable(),
});

export type StatementMetadata = z.infer<typeof MetadataSchema>;

const SYSTEM_PROMPT = [
  "You read the summary section of a bank statement and report its header/footer figures.",
  "You are NOT extracting transactions — ignore the transaction rows entirely.",
  "Find the statement's opening balance (also printed as 'balance brought forward',",
  "'previous balance', 'opening balance', 'b/f') and its closing balance ('balance",
  "carried forward', 'closing balance', 'ending balance', 'c/f'), plus the statement",
  "period and currency.",
  "Rules:",
  "- Report amounts as decimal strings exactly as printed, with a leading '-' if negative. Do NOT round or invent digits.",
  "- Use ISO-8601 (YYYY-MM-DD) for dates when unambiguous; otherwise copy the printed string.",
  "- If a value is genuinely not printed on the statement, return null. NEVER guess,",
  "  and never compute a balance by adding up the transactions.",
  "- accountLast4 is the last 4 digits of the account number only.",
  "",
  "Output format: json.",
  "Respond with ONLY a single JSON object (no markdown fences, no commentary):",
  "{",
  '  "openingBalance": string|null, "closingBalance": string|null,',
  '  "periodStart": string|null, "periodEnd": string|null,',
  '  "currency": string|null, "bankName": string|null, "accountLast4": string|null',
  "}",
].join("\n");

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() === "" ? null : value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function coerce(obj: unknown): StatementMetadata {
  const o = (obj ?? {}) as Record<string, unknown>;
  return MetadataSchema.parse({
    openingBalance: asString(o.openingBalance),
    closingBalance: asString(o.closingBalance),
    periodStart: asString(o.periodStart),
    periodEnd: asString(o.periodEnd),
    currency: asString(o.currency),
    bankName: asString(o.bankName),
    accountLast4: asString(o.accountLast4),
  });
}

/**
 * Take the head and tail of the document — banks print the summary block at the
 * top of page 1 or the bottom of the last page, never in the middle — so we
 * send a fraction of a long statement's text.
 */
export function headAndTail(text: string, sliceChars = SLICE_CHARS): string {
  if (text.length <= sliceChars * 2) return text;
  return `${text.slice(0, sliceChars)}\n\n[…]\n\n${text.slice(-sliceChars)}`;
}

/** Decode the document to text, or null when it isn't text-extractable. */
async function documentText(input: ParseInput): Promise<string | null> {
  const kind = detectKind(input.bytes, input.filename, input.contentType);

  if (kind === "pdf") {
    try {
      const { extractPdfText } = await import("@/lib/extraction/parsers/pdf");
      const { text, charCount } = await extractPdfText(input.bytes);
      if (charCount < DIGITAL_TEXT_THRESHOLD) return null; // scanned.
      return text;
    } catch {
      return null;
    }
  }

  if (kind === "image") return null; // needs vision; handled by the caller.
  if (kind === "xlsx" || kind === "xls") return null; // binary; rows only.

  return input.bytes.toString("utf-8");
}

async function askDeepSeek(userText: string): Promise<StatementMetadata | null> {
  const { callDeepSeek, stripFence } = await import("@/lib/extraction/deepseek");
  const { content } = await callDeepSeek(
    userText,
    SYSTEM_PROMPT,
    MAX_OUTPUT_TOKENS,
  );
  return coerce(JSON.parse(stripFence(content)));
}

async function askClaude(userText: string): Promise<StatementMetadata | null> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const { zodOutputFormat } = await import("@anthropic-ai/sdk/helpers/zod");
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 3 });

  const message = await client.messages.parse({
    model: env.ANTHROPIC_EXTRACTION_MODEL,
    max_tokens: 2_000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userText }],
    output_config: { format: zodOutputFormat(MetadataSchema) },
  });
  return message.parsed_output ?? null;
}

/**
 * Whether the statement already has balances the validator can actually verify
 * against. Both present, and not *both* derived from the rows (which would make
 * the closing check circular). When false, the metadata pass is worth running.
 */
export function needsBalanceMetadata(s: {
  openingBalance: bigint | null;
  closingBalance: bigint | null;
  openingBalanceInferred: boolean;
  closingBalanceInferred: boolean;
}): boolean {
  const bothPresent = s.openingBalance != null && s.closingBalance != null;
  const bothDerived = s.openingBalanceInferred && s.closingBalanceInferred;
  return !bothPresent || bothDerived;
}

/**
 * Fill gaps in a normalized statement from LLM-read metadata. Fill-only: a
 * figure the deterministic parser read off the statement is never overwritten.
 * A row-derived balance *is* replaced by an AI-read one, because the AI value
 * is independent evidence and the derived one is not — that swap is what lets
 * the closing check run at all.
 */
export function mergeStatementMetadata(
  statement: NormalizedStatement,
  meta: StatementMetadata,
): NormalizedStatement {
  const { currency } = statement;
  const merged = { ...statement };

  const aiOpening = parseSignedMoney(meta.openingBalance, currency);
  if (aiOpening != null && (merged.openingBalance == null || merged.openingBalanceInferred)) {
    merged.openingBalance = aiOpening;
    merged.openingBalanceInferred = false; // read off the statement
  }

  const aiClosing = parseSignedMoney(meta.closingBalance, currency);
  if (aiClosing != null && (merged.closingBalance == null || merged.closingBalanceInferred)) {
    merged.closingBalance = aiClosing;
    merged.closingBalanceInferred = false;
  }

  merged.periodStart ??= parseStatementDate(meta.periodStart, "DMY");
  merged.periodEnd ??= parseStatementDate(meta.periodEnd, "DMY");
  merged.bankName ??= meta.bankName?.trim() || null;

  const last4 = meta.accountLast4?.replace(/\D/g, "").slice(-4) ?? "";
  merged.accountLast4 ??= last4.length === 4 ? last4 : null;

  return merged;
}

/**
 * Read a statement's opening/closing balance and period from the document.
 * Returns null when no provider is configured, the file isn't text-extractable,
 * or the model call fails — the caller treats that as "nothing learned" and
 * carries on. Never throws.
 */
export async function extractStatementMetadata(
  input: ParseInput,
): Promise<StatementMetadata | null> {
  const provider = pickProvider(input);
  if (!provider) return null;

  const text = await documentText(input);
  if (text === null) return null;

  const sliced = headAndTail(text);
  const body = env.LLM_REDACT_PII ? redactAccountNumbers(sliced) : sliced;
  const userText = `Read the summary section of this bank statement.\n\n----\n${body}`;

  try {
    return provider === "deepseek"
      ? await askDeepSeek(userText)
      : await askClaude(userText);
  } catch (error) {
    // Best-effort enrichment: a failure here must never fail the import.
    console.error("[metadata] extraction failed", error);
    return null;
  }
}
