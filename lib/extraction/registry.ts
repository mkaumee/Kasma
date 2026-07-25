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

/** Parse a statement using the first parser that supports its detected kind. */
export async function parseStatement(input: ParseInput): Promise<ParseResult> {
  const parser = selectParser(input);
  if (!parser) {
    throw new ExtractionError("No parser available for this file type.");
  }
  return parser.parse(input);
}

/** Test/introspection helper. */
export function registeredParserNames(): string[] {
  return parsers.map((p) => p.name);
}
