import { detectKind } from "@/lib/extraction/detect";
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
  if (parser) {
    deterministic = await parser.parse(input);
    if (deterministic.confidence >= LLM_FALLBACK_THRESHOLD) {
      return deterministic;
    }
  }

  // Low confidence or no deterministic parser: try the LLM, if configured.
  const { isLlmAvailable, llmExtract } = await import("@/lib/extraction/llm");
  if (isLlmAvailable()) {
    try {
      const llm = await llmExtract(input);
      if (!deterministic || llm.confidence >= deterministic.confidence) {
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
