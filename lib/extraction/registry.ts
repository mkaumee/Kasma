import { detectKind } from "@/lib/extraction/detect";
import { normalizeStatement } from "@/lib/extraction/normalize";
import {
  ExtractionError,
  type ParseInput,
  type ParseResult,
  type Parser,
} from "@/lib/extraction/types";

// Parsers are registered here as they are implemented (Phase 6.4–6.7), in
// priority order. The LLM fallback (6.7) is not a registered parser — the
// orchestrator invokes it directly on low confidence (see parseStatement).
const parsers: Parser[] = [];

/** Register a parser (called by parser modules at import time). */
export function registerParser(parser: Parser): void {
  if (!parsers.some((p) => p.name === parser.name)) parsers.push(parser);
}

export function selectParser(input: ParseInput): Parser | null {
  const kind = detectKind(input.bytes, input.filename, input.contentType);
  return parsers.find((p) => p.supports(kind)) ?? null;
}

/**
 * Below this confidence, a deterministic parse is treated as unreliable and
 * the LLM fallback is attempted (scanned PDFs, images, odd layouts).
 */
const LLM_FALLBACK_THRESHOLD = 0.6;

/**
 * How much of a parse is actually usable, judged by running the real normalizer.
 *
 * A parser's own confidence measures whether it *recognised* a table — header
 * found, some rows emitted — and says nothing about whether those rows survive
 * date/amount parsing. A PDF whose columns were mis-split reported 0.85 while
 * every one of its rows was discarded, and because 0.85 clears the fallback
 * threshold, the LLM that could have read it was never consulted.
 *
 * Normalization is pure and cheap, so measuring it here (and again in the
 * pipeline, for real) is a fair trade for not trusting a hollow score.
 */
function usableRatio(result: ParseResult, hintCurrency?: string): number {
  const total = result.raw.transactions.length;
  if (total === 0) return 0;
  const normalized = normalizeStatement(result.raw, {
    fallbackCurrency: hintCurrency,
  });
  return normalized.transactions.length / total;
}

/**
 * Confidence to use when deciding whether the LLM is needed: the parser's own
 * score, scaled by the share of rows that actually normalize. Zero usable rows
 * floors it, so a hollow parse can never block the fallback.
 */
export function effectiveConfidence(
  result: ParseResult,
  hintCurrency?: string,
): number {
  const ratio = usableRatio(result, hintCurrency);
  if (ratio === 0) return 0.05;
  return result.confidence * ratio;
}

/**
 * Parse a statement. Runs the best deterministic parser first; if it is
 * missing or low-confidence, falls back to the configured LLM extractor
 * (DeepSeek by default, Claude for vision — see lib/extraction/llm.ts).
 * Whichever yields the higher confidence wins. The LLM module is imported
 * lazily so provider SDKs/transport stay out of paths that never need them
 * (and out of any client bundle).
 */
export async function parseStatement(input: ParseInput): Promise<ParseResult> {
  const parser = selectParser(input);

  let deterministic: ParseResult | null = null;
  // Judged on usable rows, not just on having recognised a table.
  let deterministicScore = 0;
  if (parser) {
    deterministic = await parser.parse(input);
    deterministicScore = effectiveConfidence(deterministic, input.hintCurrency);
    if (deterministicScore >= LLM_FALLBACK_THRESHOLD) {
      return deterministic;
    }
  }

  // Low confidence or no deterministic parser: try the LLM, if configured.
  const { isLlmAvailable, llmExtract } = await import("@/lib/extraction/llm");
  if (isLlmAvailable()) {
    try {
      const llm = await llmExtract(input);
      // A provider that bowed out ("I can't read this kind of input") is not a
      // candidate — it has no rows and would otherwise win a 0.05 vs 0.05 tie
      // and take the blame for a failure that happened upstream of it.
      const bowedOut = typeof llm.meta?.unsupported === "string";
      // Compare like with like: the LLM's rows are judged on the same
      // usable-row basis as the deterministic parser's.
      const llmScore = effectiveConfidence(llm, input.hintCurrency);
      // Strictly greater: on a tie, keep the deterministic parser's result so
      // the recorded parser name points at what actually ran.
      if (!bowedOut && (!deterministic || llmScore > deterministicScore)) {
        return llm;
      }
    } catch (error) {
      // LLM fallback failed: use the deterministic result if we have one.
      if (!deterministic) {
        throw new ExtractionError(
          `No deterministic parser and LLM fallback failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  if (deterministic) return deterministic;
  throw new ExtractionError("No parser available for this file type.");
}

/** Test/introspection helper. */
export function registeredParserNames(): string[] {
  return parsers.map((p) => p.name);
}
