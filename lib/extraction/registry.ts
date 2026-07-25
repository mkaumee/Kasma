import { detectKind } from "@/lib/extraction/detect";
import {
  ExtractionError,
  type ParseInput,
  type ParseResult,
  type Parser,
} from "@/lib/extraction/types";

// Parsers are registered here as they are implemented (Phase 6.4–6.7), in
// priority order. The Claude fallback (6.7) is registered last.
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
 * the Claude fallback is attempted (scanned PDFs, images, odd layouts).
 */
const CLAUDE_FALLBACK_THRESHOLD = 0.6;

/**
 * Parse a statement. Runs the best deterministic parser first; if it is
 * missing or low-confidence, falls back to the Claude extractor when it is
 * configured. Whichever yields the higher confidence wins. The Claude module
 * is imported lazily so the Anthropic SDK stays out of paths that never need
 * it (and out of any client bundle).
 */
export async function parseStatement(input: ParseInput): Promise<ParseResult> {
  const parser = selectParser(input);

  let deterministic: ParseResult | null = null;
  if (parser) {
    deterministic = await parser.parse(input);
    if (deterministic.confidence >= CLAUDE_FALLBACK_THRESHOLD) {
      return deterministic;
    }
  }

  // Low confidence or no deterministic parser: try Claude, if configured.
  const { isClaudeAvailable, claudeExtract } = await import(
    "@/lib/extraction/claude"
  );
  if (isClaudeAvailable()) {
    try {
      const claude = await claudeExtract(input);
      if (!deterministic || claude.confidence >= deterministic.confidence) {
        return claude;
      }
    } catch (error) {
      // Claude fallback failed: use the deterministic result if we have one.
      if (!deterministic) {
        throw new ExtractionError(
          `No deterministic parser and Claude fallback failed: ${
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
