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
 * A provider that can read pixels — needed for scanned PDFs and images, which
 * no amount of text extraction will recover.
 *
 * Today this resolves to Claude when its key is set, and to null otherwise (so
 * a DeepSeek-only deploy behaves exactly as before). It is a seam, not a
 * hardcoding: DeepSeek's own vision model (DeepSeek-OCR) has no hosted API and
 * must be self-hosted, so when one is available it slots in here.
 */
export function pickVisionProvider(): Provider | null {
  return env.ANTHROPIC_API_KEY ? "anthropic" : null;
}

async function runProvider(
  provider: Provider,
  input: ParseInput,
): Promise<ParseResult> {
  if (provider === "deepseek") {
    const { deepseekExtract } = await import("@/lib/extraction/deepseek");
    return deepseekExtract(input);
  }
  const { claudeExtract } = await import("@/lib/extraction/claude");
  return claudeExtract(input);
}

/**
 * Run the configured LLM extractor on a statement file. Throws if no provider
 * is configured — callers must check {@link isLlmAvailable} first.
 *
 * When the chosen provider bows out because it can't read the input (a scanned
 * PDF handed to a text-only model), retry once with a vision provider. Whether
 * a PDF is scanned is only discoverable by trying, so this second chance is the
 * only way such a file can reach vision at all.
 */
export async function llmExtract(input: ParseInput): Promise<ParseResult> {
  const provider = pickProvider(input);
  if (!provider) {
    throw new ExtractionError("No LLM extraction provider is configured.");
  }

  const result = await runProvider(provider, input);
  if (typeof result.meta?.unsupported !== "string") return result;

  const vision = pickVisionProvider();
  if (!vision || vision === provider) return result;
  return runProvider(vision, input);
}
