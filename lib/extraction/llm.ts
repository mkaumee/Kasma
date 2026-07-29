import { detectKind } from "@/lib/extraction/detect";
import { ExtractionError, type ParseInput, type ParseResult } from "@/lib/extraction/types";
import { env } from "@/lib/env";

/**
 * LLM-extraction dispatcher — the single fallback entry point the parser
 * registry calls when the deterministic parsers fail or return low confidence.
 * It picks between the configured providers:
 *
 *  - **DeepSeek** (default when DEEPSEEK_API_KEY is set) — text-only, cheap;
 *    handles CSV/text and digital PDFs.
 *  - **Claude** (when ANTHROPIC_API_KEY is set) — has vision, so it reads
 *    scanned PDFs and images that DeepSeek can't.
 *
 * `EXTRACTION_PROVIDER` pins a preference ("deepseek" | "anthropic" | "auto").
 * In "auto" (the default) DeepSeek wins when configured, but image/scanned
 * inputs are routed to Claude when it's available, since DeepSeek has no vision.
 *
 * Providers are imported lazily so their SDK/transport stays out of paths that
 * never need them (and out of any client bundle).
 */

type Provider = "deepseek" | "anthropic";

/** Whether any LLM extraction provider is configured in this environment. */
export function isLlmAvailable(): boolean {
  return Boolean(env.DEEPSEEK_API_KEY) || Boolean(env.ANTHROPIC_API_KEY);
}

/**
 * Choose the provider for a given input, honoring EXTRACTION_PROVIDER and the
 * vision constraint. Returns null only when no provider is configured.
 */
export function pickProvider(input: ParseInput): Provider | null {
  const hasDeepSeek = Boolean(env.DEEPSEEK_API_KEY);
  const hasClaude = Boolean(env.ANTHROPIC_API_KEY);
  if (!hasDeepSeek && !hasClaude) return null;

  const kind = detectKind(input.bytes, input.filename, input.contentType);
  // DeepSeek can't see images; a scanned PDF also needs vision, but we only
  // learn a PDF is scanned once its text layer comes up empty (handled inside
  // deepseekExtract), so here we only special-case obvious images.
  const needsVision = kind === "image";

  switch (env.EXTRACTION_PROVIDER) {
    case "anthropic":
      return hasClaude ? "anthropic" : hasDeepSeek ? "deepseek" : null;
    case "deepseek":
      if (needsVision && hasClaude) return "anthropic";
      return hasDeepSeek ? "deepseek" : "anthropic";
    default: // "auto"
      if (needsVision && hasClaude) return "anthropic";
      if (hasDeepSeek) return "deepseek";
      return "anthropic";
  }
}

/**
 * Run the configured LLM extractor on a statement file. Throws if no provider
 * is configured — callers must check {@link isLlmAvailable} first.
 */
export async function llmExtract(input: ParseInput): Promise<ParseResult> {
  const provider = pickProvider(input);
  if (provider === "deepseek") {
    const { deepseekExtract } = await import("@/lib/extraction/deepseek");
    return deepseekExtract(input);
  }
  if (provider === "anthropic") {
    const { claudeExtract } = await import("@/lib/extraction/claude");
    return claudeExtract(input);
  }
  throw new ExtractionError("No LLM extraction provider is configured.");
}
