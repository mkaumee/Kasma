import { createRequire } from "node:module";
import { dirname, join } from "node:path";

import type { DetectedKind } from "@/lib/extraction/detect";
import {
  groupLines,
  itemsToRows,
  type TextItem,
} from "@/lib/extraction/pdf-table";
import { extractFromRows } from "@/lib/extraction/tabular";
import type { ParseInput, ParseResult, Parser } from "@/lib/extraction/types";

/** Minimum extracted characters for a PDF to be considered "digital". */
const DIGITAL_TEXT_THRESHOLD = 40;

// Minimal local view of the pdfjs surface we use (the legacy .mjs entrypoint's
// published types vary; we only need these members).
type PdfTextItem = { str?: string; transform?: number[] };
type PdfPage = { getTextContent(): Promise<{ items: PdfTextItem[] }> };
type PdfDoc = {
  numPages: number;
  getPage(n: number): Promise<PdfPage>;
  /** NOTE: PDFDocumentProxy has `cleanup()`, NOT `destroy()` — see below. */
  cleanup(keepLoadedFonts?: boolean): Promise<unknown>;
};
/** `getDocument()` returns the loading task; only it owns `destroy()`. */
type PdfLoadingTask = {
  promise: Promise<PdfDoc>;
  destroy(): Promise<void>;
};
type GetDocumentParams = {
  data: Uint8Array;
  useSystemFonts?: boolean;
  cMapUrl?: string;
  cMapPacked?: boolean;
  standardFontDataUrl?: string;
  isEvalSupported?: boolean;
  password?: string;
};
type PdfjsModule = {
  getDocument(params: GetDocumentParams): PdfLoadingTask;
};

/**
 * Locate the character-map and standard-font data that ship inside pdfjs-dist.
 *
 * These are NOT optional for real-world statements: PDFs that embed CID-keyed or
 * subset fonts (most bank statements) need the cMaps to map glyph codes back to
 * Unicode. Without them `getTextContent()` yields empty or replacement characters
 * for a document that displays and selects perfectly in a viewer — which reads
 * downstream as "scanned PDF" and silently kills the whole extraction.
 *
 * Resolved from the installed package rather than hardcoded so it survives
 * hoisting/pnpm layouts. pdfjs requires trailing slashes on both paths.
 */
function pdfAssetPaths(): { cMapUrl?: string; standardFontDataUrl?: string } {
  try {
    const require = createRequire(import.meta.url);
    const root = dirname(require.resolve("pdfjs-dist/package.json"));
    return {
      cMapUrl: `${join(root, "cmaps")}/`,
      standardFontDataUrl: `${join(root, "standard_fonts")}/`,
    };
  } catch {
    // Bundled/exotic layout: fall back to pdfjs' built-in defaults.
    return {};
  }
}

async function extractTextItems(
  bytes: Buffer,
): Promise<{ items: TextItem[]; charCount: number }> {
  // Legacy build + main-thread (no worker) for Node.
  const pdfjs =
    (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    ...pdfAssetPaths(),
    cMapPacked: true,
    // Node has no system font stack; substituting against it can fail outright.
    useSystemFonts: false,
    // No need to eval font programs server-side.
    isEvalSupported: false,
    // Opens permissions-locked PDFs (owner password set, user password empty),
    // which many banks emit. A real user password still rejects, as it should.
    password: "",
  });

  const items: TextItem[] = [];
  let charCount = 0;
  try {
    const doc = await loadingTask.promise;
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if (typeof item.str === "string" && item.transform) {
          items.push({
            str: item.str,
            x: item.transform[4]!,
            y: item.transform[5]!,
          });
          charCount += item.str.trim().length;
        }
      }
    }
  } finally {
    // Release worker/transport resources. `destroy()` lives on the LOADING TASK
    // — PDFDocumentProxy only has `cleanup()`. Calling doc.destroy() throws
    // "doc.destroy is not a function" *after* a successful extraction, which is
    // what made every PDF upload fail with a bare "pdf-parse-failed".
    await loadingTask.destroy().catch(() => {});
  }
  return { items, charCount };
}

/**
 * Extract a PDF's text layer as newline-separated lines, for the text-only LLM
 * providers (e.g. DeepSeek) that cannot read the PDF directly. `charCount` lets
 * the caller detect scanned/image PDFs (little-to-no text) and bow out. Throws
 * on encrypted/malformed PDFs — callers should treat that as "no text layer".
 */
export async function extractPdfText(
  bytes: Buffer,
): Promise<{ text: string; charCount: number }> {
  const { items, charCount } = await extractTextItems(bytes);
  const text = groupLines(items)
    .map((line) => line.items.map((it) => it.str).join(" ").trim())
    .filter((line) => line !== "")
    .join("\n");
  return { text, charCount };
}

export const pdfParser: Parser = {
  name: "pdf",

  supports(kind: DetectedKind) {
    return kind === "pdf";
  },

  async parse(input: ParseInput): Promise<ParseResult> {
    let items: TextItem[];
    let charCount: number;
    try {
      ({ items, charCount } = await extractTextItems(input.bytes));
    } catch (error) {
      // Bind the error. pdfjs throws typed exceptions (PasswordException,
      // InvalidPDFException, …); a bare `catch {}` here previously destroyed the
      // only evidence of why a readable-looking PDF produced nothing.
      const name = error instanceof Error ? error.name : "Error";
      const message = error instanceof Error ? error.message : String(error);
      return {
        parser: "pdf",
        confidence: 0.05,
        raw: { currency: input.hintCurrency ?? null, transactions: [] },
        meta: {
          error: "pdf-parse-failed",
          errorName: name,
          errorMessage: message.slice(0, 300),
          // Password-protected files are worth calling out by name to the user.
          encrypted: name === "PasswordException",
        },
      };
    }

    if (charCount < DIGITAL_TEXT_THRESHOLD) {
      // No usable text layer: either a scan, or fonts we couldn't decode.
      // charCount distinguishes "nothing at all" from "a few stray glyphs".
      return {
        parser: "pdf",
        confidence: 0.05,
        raw: { currency: input.hintCurrency ?? null, transactions: [] },
        meta: { scanned: true, charCount },
      };
    }

    const rows = itemsToRows(items);
    const { raw, confidence, headerIndex, columns } = extractFromRows(
      rows,
      input.hintCurrency,
    );

    return {
      parser: "pdf",
      // Digital-PDF reconstruction is best-effort; cap confidence a little.
      confidence: Math.min(confidence, 0.85),
      raw,
      meta: { headerIndex, columns, charCount },
    };
  },
};
