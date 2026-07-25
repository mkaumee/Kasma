import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import { detectKind } from "@/lib/extraction/detect";
import type {
  ParseInput,
  ParseResult,
  RawStatement,
  RawTransactionRow,
} from "@/lib/extraction/types";
import { env } from "@/lib/env";

/**
 * Claude-powered statement extractor — the fallback path in the "no bank API"
 * pipeline. It is only invoked when the deterministic parsers fail or return
 * low confidence (see `parseStatement` in registry.ts), for formats like
 * scanned PDFs, images, or unknown layouts.
 *
 * Guardrails (see docs/PLAN.md Appendix D):
 *  - Output is forced to a strict JSON schema; we never free-parse prose.
 *  - We never trust the model's math: totals/continuity are recomputed by the
 *    validation engine (6.9) against the statement's running balance.
 *  - The raw model response is returned in `meta` so the caller can persist it
 *    (rawExtractionKey) as an audit trail.
 *  - Optional PII redaction masks likely account numbers before sending text.
 *  - Gracefully unavailable: without ANTHROPIC_API_KEY the pipeline still runs
 *    on the deterministic parsers alone.
 */

/** Cap on text sent to the model, to bound token cost on huge exports. */
const MAX_TEXT_CHARS = 200_000;

/** Base confidence for a successful Claude extraction, before validation. */
const CLAUDE_BASE_CONFIDENCE = 0.7;

const TransactionSchema = z.object({
  date: z.string().nullable(),
  valueDate: z.string().nullable(),
  description: z.string().nullable(),
  /** Signed decimal string (negative = debit), when a single amount column. */
  amount: z.string().nullable(),
  /** Separate debit/credit magnitudes, when the statement splits them. */
  debit: z.string().nullable(),
  credit: z.string().nullable(),
  /** Running balance after this row, as printed on the statement. */
  balance: z.string().nullable(),
  reference: z.string().nullable(),
  counterparty: z.string().nullable(),
});

const StatementSchema = z.object({
  bankName: z.string().nullable(),
  accountLast4: z.string().nullable(),
  periodStart: z.string().nullable(),
  periodEnd: z.string().nullable(),
  openingBalance: z.string().nullable(),
  closingBalance: z.string().nullable(),
  currency: z.string().nullable(),
  transactions: z.array(TransactionSchema),
});

type ClaudeStatement = z.infer<typeof StatementSchema>;

const SYSTEM_PROMPT = [
  "You are a meticulous bank-statement data-extraction engine.",
  "Extract every transaction row from the provided bank statement exactly as printed.",
  "Rules:",
  "- Preserve amounts as decimal strings exactly as shown (keep the sign; use a leading '-' for debits/withdrawals). Do NOT round, reformat, or invent digits.",
  "- If a statement uses separate debit and credit columns, fill `debit` and `credit` and leave `amount` null.",
  "- If it uses one signed amount column, fill `amount` and leave `debit`/`credit` null.",
  "- Copy the printed running `balance` for each row when present; otherwise null.",
  "- Use ISO-8601 (YYYY-MM-DD) for dates when the format is unambiguous; otherwise copy the printed date string.",
  "- Never fabricate rows, balances, or totals. If a value is not present, use null.",
  "- Return ALL rows, in the order they appear.",
].join("\n");

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!cachedClient) {
    cachedClient = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
      // The SDK retries transient errors (429/5xx/network) with backoff.
      maxRetries: 3,
    });
  }
  return cachedClient;
}

/** Whether the Claude fallback is configured in this environment. */
export function isClaudeAvailable(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

function imageMediaType(
  bytes: Buffer,
): "image/png" | "image/jpeg" | "image/webp" {
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    return "image/jpeg";
  }
  return "image/webp";
}

/**
 * Mask sequences that look like full account/card numbers, keeping only the
 * last 4 digits. The 12-digit threshold targets card numbers (13–19),
 * IBAN-length and long account numbers while deliberately leaving dates
 * (≤8 digits) and money amounts untouched.
 */
export function redactAccountNumbers(text: string): string {
  return text.replace(/\b\d[\d -]{10,}\d\b/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 12) return match;
    return `${"*".repeat(digits.length - 4)}${digits.slice(-4)}`;
  });
}

type ContentBlock = Anthropic.Messages.ContentBlockParam;

function buildContent(input: ParseInput): ContentBlock[] {
  const kind = detectKind(input.bytes, input.filename, input.contentType);
  const instruction = input.hintCurrency
    ? `Extract this bank statement. The account currency is likely ${input.hintCurrency} if the statement does not state one.`
    : "Extract this bank statement.";

  if (kind === "pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: input.bytes.toString("base64"),
        },
      },
      { type: "text", text: instruction },
    ];
  }

  if (kind === "image") {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: imageMediaType(input.bytes),
          data: input.bytes.toString("base64"),
        },
      },
      { type: "text", text: instruction },
    ];
  }

  // CSV / unknown / text: send the decoded text (optionally redacted).
  let text = input.bytes.toString("utf-8").slice(0, MAX_TEXT_CHARS);
  if (env.LLM_REDACT_PII) text = redactAccountNumbers(text);
  return [{ type: "text", text: `${instruction}\n\n----\n${text}` }];
}

function toRawStatement(
  parsed: ClaudeStatement,
  hintCurrency?: string,
): RawStatement {
  const transactions: RawTransactionRow[] = parsed.transactions.map((t) => ({
    date: t.date,
    valueDate: t.valueDate,
    description: t.description,
    amount: t.amount,
    debit: t.debit,
    credit: t.credit,
    balance: t.balance,
    reference: t.reference,
    counterparty: t.counterparty,
  }));

  return {
    bankName: parsed.bankName,
    accountLast4: parsed.accountLast4,
    periodStart: parsed.periodStart,
    periodEnd: parsed.periodEnd,
    openingBalance: parsed.openingBalance,
    closingBalance: parsed.closingBalance,
    currency: parsed.currency ?? hintCurrency ?? null,
    transactions,
  };
}

/**
 * Run the Claude extractor on a statement file. Returns a ParseResult tagged
 * `parser: "claude"`. Throws if the model call fails or returns no parseable
 * output — the orchestrator falls back to any deterministic result in that
 * case. Callers must check {@link isClaudeAvailable} first.
 */
export async function claudeExtract(input: ParseInput): Promise<ParseResult> {
  const client = getClient();
  const model = env.ANTHROPIC_EXTRACTION_MODEL;

  const message = await client.messages.parse({
    model,
    // Statements can be long; give the extraction room and stream-free parse.
    max_tokens: 16_000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildContent(input) }],
    output_config: { format: zodOutputFormat(StatementSchema) },
  });

  const parsed = message.parsed_output;
  if (!parsed) {
    return {
      parser: "claude",
      confidence: 0.05,
      raw: { currency: input.hintCurrency ?? null, transactions: [] },
      meta: { model, error: "claude-parse-empty" },
    };
  }

  const raw = toRawStatement(parsed, input.hintCurrency);
  const confidence =
    raw.transactions.length > 0 ? CLAUDE_BASE_CONFIDENCE : 0.2;

  return {
    parser: "claude",
    confidence,
    raw,
    meta: {
      model,
      usage: message.usage,
      // Retained for the audit trail (persisted as rawExtractionKey in 6.11).
      rawResponse: JSON.stringify(parsed),
    },
  };
}
