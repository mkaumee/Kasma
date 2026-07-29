import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { detectKind } from "@/lib/extraction/detect";
import {
  LLM_BASE_CONFIDENCE,
  MAX_TEXT_CHARS,
  StatementSchema,
  SYSTEM_PROMPT,
  redactAccountNumbers,
  toRawStatement,
} from "@/lib/extraction/llm-schema";
import type { ParseInput, ParseResult } from "@/lib/extraction/types";
import { env } from "@/lib/env";

/**
 * Claude-powered statement extractor — one of the LLM fallback providers in the
 * "no bank API" pipeline (see `pickProvider` in llm.ts). It is only invoked when
 * the deterministic parsers fail or return low confidence, for formats like
 * scanned PDFs, images, or unknown layouts. Unlike DeepSeek, Claude can read
 * PDFs and images directly (vision), so it stays the provider for scanned input.
 *
 * Guardrails (see docs/PLAN.md Appendix D):
 *  - Output is forced to a strict JSON schema; we never free-parse prose.
 *  - We never trust the model's math: totals/continuity are recomputed by the
 *    validation engine (6.9) against the statement's running balance.
 *  - The raw model response is returned in `meta` so the caller can persist it
 *    (rawExtractionKey) as an audit trail.
 *  - Optional PII redaction masks likely account numbers before sending text.
 *  - Gracefully unavailable: without ANTHROPIC_API_KEY this provider is skipped.
 */

// Re-exported so existing importers of the redaction guardrail keep working;
// the canonical definition now lives in llm-schema (shared with DeepSeek).
export { redactAccountNumbers };

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
    raw.transactions.length > 0 ? LLM_BASE_CONFIDENCE : 0.2;

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
