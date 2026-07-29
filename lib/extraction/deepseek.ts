import { detectKind } from "@/lib/extraction/detect";
import {
  LLM_BASE_CONFIDENCE,
  MAX_TEXT_CHARS,
  StatementSchema,
  SYSTEM_PROMPT,
  redactAccountNumbers,
  toRawStatement,
  type LlmStatement,
} from "@/lib/extraction/llm-schema";
import type { ParseInput, ParseResult } from "@/lib/extraction/types";
import { env } from "@/lib/env";

/**
 * DeepSeek-powered statement extractor — the default LLM fallback provider
 * when DEEPSEEK_API_KEY is set (see `pickProvider` in llm.ts). It talks to
 * DeepSeek's OpenAI-compatible chat-completions endpoint over raw HTTP with
 * JSON mode; it does NOT use the Anthropic SDK.
 *
 * Key limitation vs. Claude: **DeepSeek is text-only (no vision).** It handles
 * text-extractable statements — CSV/text and digital PDFs whose text layer we
 * can pull — but cannot read scanned PDFs or images. For those it returns a
 * low-confidence "unsupported" result so the pipeline routes them to review
 * (or to Claude, when configured as the vision provider).
 *
 * The same guardrails as the Claude path apply: strict JSON shape, optional
 * PII redaction before send, and "never trust the model's math" (the validator
 * recomputes continuity against the running balance).
 */

/** Minimum extracted characters for a PDF's text layer to be usable. */
const DIGITAL_TEXT_THRESHOLD = 40;

/** DeepSeek chat completions cap output at 8192 tokens; leave a little room. */
const MAX_OUTPUT_TOKENS = 8000;

/** Per-request timeout and transient-retry budget for the HTTP call. */
const REQUEST_TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 3;

const JSON_INSTRUCTIONS = [
  "",
  "Respond with ONLY a single JSON object (no markdown fences, no commentary)",
  "matching exactly this shape:",
  "{",
  '  "bankName": string|null,',
  '  "accountLast4": string|null,',
  '  "periodStart": string|null,',
  '  "periodEnd": string|null,',
  '  "openingBalance": string|null,',
  '  "closingBalance": string|null,',
  '  "currency": string|null,',
  '  "transactions": [',
  '    { "date": string|null, "valueDate": string|null, "description": string|null,',
  '      "amount": string|null, "debit": string|null, "credit": string|null,',
  '      "balance": string|null, "reference": string|null, "counterparty": string|null }',
  "  ]",
  "}",
].join("\n");

/** Whether the DeepSeek provider is configured in this environment. */
export function isDeepSeekAvailable(): boolean {
  return Boolean(env.DEEPSEEK_API_KEY);
}

/** Coerce any JSON scalar the model returns into a nullable trimmed string. */
function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

/**
 * Normalize a loosely-shaped model object into the strict statement schema.
 * DeepSeek's JSON mode does not enforce a schema, so a field may be missing or
 * come back as a number; we fill every key and coerce scalars before parsing.
 */
function coerceStatement(obj: unknown): LlmStatement {
  const o = (obj ?? {}) as Record<string, unknown>;
  const rows = Array.isArray(o.transactions) ? o.transactions : [];
  return StatementSchema.parse({
    bankName: asString(o.bankName),
    accountLast4: asString(o.accountLast4),
    periodStart: asString(o.periodStart),
    periodEnd: asString(o.periodEnd),
    openingBalance: asString(o.openingBalance),
    closingBalance: asString(o.closingBalance),
    currency: asString(o.currency),
    transactions: rows.map((r) => {
      const t = (r ?? {}) as Record<string, unknown>;
      return {
        date: asString(t.date),
        valueDate: asString(t.valueDate),
        description: asString(t.description),
        amount: asString(t.amount),
        debit: asString(t.debit),
        credit: asString(t.credit),
        balance: asString(t.balance),
        reference: asString(t.reference),
        counterparty: asString(t.counterparty),
      };
    }),
  });
}

/** Strip an accidental ```json fence the model may wrap the object in. */
function stripFence(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith("```")) {
    return trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();
  }
  return trimmed;
}

type DeepSeekChoice = { message?: { content?: string } };
type DeepSeekResponse = { choices?: DeepSeekChoice[]; usage?: unknown };

/** Call DeepSeek's chat-completions endpoint with JSON mode + transient retries. */
async function callDeepSeek(
  userText: string,
): Promise<{ content: string; usage: unknown }> {
  const url = `${env.DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`;
  const body = JSON.stringify({
    model: env.DEEPSEEK_MODEL,
    messages: [
      { role: "system", content: `${SYSTEM_PROMPT}\n${JSON_INSTRUCTIONS}` },
      { role: "user", content: userText },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${env.DEEPSEEK_API_KEY}`,
        },
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        // Retry only transient failures (429 / 5xx); fail fast otherwise.
        if (res.status === 429 || res.status >= 500) {
          lastError = new Error(`DeepSeek ${res.status}: ${detail.slice(0, 200)}`);
          throw lastError;
        }
        throw new Error(`DeepSeek ${res.status}: ${detail.slice(0, 200)}`);
      }

      const json = (await res.json()) as DeepSeekResponse;
      const content = json.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.trim() === "") {
        throw new Error("DeepSeek returned an empty completion");
      }
      return { content, usage: json.usage };
    } catch (error) {
      lastError = error;
      const retriable =
        error instanceof Error &&
        (error.name === "AbortError" || /DeepSeek (429|5\d\d)/.test(error.message));
      if (attempt === MAX_ATTEMPTS || !retriable) throw error;
      await new Promise((r) => setTimeout(r, 2 ** attempt * 500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** A low-confidence "can't handle this input" result (image/scanned PDF). */
function unsupported(input: ParseInput, reason: string): ParseResult {
  return {
    parser: "deepseek",
    confidence: 0.05,
    raw: { currency: input.hintCurrency ?? null, transactions: [] },
    meta: { model: env.DEEPSEEK_MODEL, unsupported: reason },
  };
}

/**
 * Build the text payload for DeepSeek. Returns null when the input can't be
 * turned into text (image, or a scanned PDF with no usable text layer).
 */
async function buildText(input: ParseInput): Promise<string | null> {
  const kind = detectKind(input.bytes, input.filename, input.contentType);

  if (kind === "image") return null; // DeepSeek has no vision.

  if (kind === "pdf") {
    try {
      const { extractPdfText } = await import("@/lib/extraction/parsers/pdf");
      const { text, charCount } = await extractPdfText(input.bytes);
      if (charCount < DIGITAL_TEXT_THRESHOLD) return null; // scanned PDF.
      return text.slice(0, MAX_TEXT_CHARS);
    } catch {
      return null; // encrypted/malformed → no text layer.
    }
  }

  // CSV / text / unknown: decode as UTF-8.
  return input.bytes.toString("utf-8").slice(0, MAX_TEXT_CHARS);
}

/**
 * Run the DeepSeek extractor on a statement file. Returns a ParseResult tagged
 * `parser: "deepseek"`. For inputs DeepSeek can't read (images, scanned PDFs)
 * it returns a low-confidence result rather than throwing. Callers must check
 * {@link isDeepSeekAvailable} first.
 */
export async function deepseekExtract(input: ParseInput): Promise<ParseResult> {
  let text = await buildText(input);
  if (text === null) {
    return unsupported(
      input,
      "DeepSeek is text-only; scanned PDFs and images need the Claude vision provider.",
    );
  }
  if (env.LLM_REDACT_PII) text = redactAccountNumbers(text);

  const instruction = input.hintCurrency
    ? `Extract this bank statement. The account currency is likely ${input.hintCurrency} if the statement does not state one.`
    : "Extract this bank statement.";

  const { content, usage } = await callDeepSeek(`${instruction}\n\n----\n${text}`);

  let parsed: LlmStatement;
  try {
    parsed = coerceStatement(JSON.parse(stripFence(content)));
  } catch {
    return {
      parser: "deepseek",
      confidence: 0.05,
      raw: { currency: input.hintCurrency ?? null, transactions: [] },
      meta: { model: env.DEEPSEEK_MODEL, error: "deepseek-parse-empty" },
    };
  }

  const raw = toRawStatement(parsed, input.hintCurrency);
  const confidence = raw.transactions.length > 0 ? LLM_BASE_CONFIDENCE : 0.2;

  return {
    parser: "deepseek",
    confidence,
    raw,
    meta: {
      model: env.DEEPSEEK_MODEL,
      usage,
      // Retained for the audit trail (persisted as rawExtractionKey in 6.11).
      rawResponse: JSON.stringify(parsed),
    },
  };
}
