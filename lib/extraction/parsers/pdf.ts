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
  destroy(): Promise<void>;
};
type PdfjsModule = {
  getDocument(params: { data: Uint8Array; useSystemFonts?: boolean }): {
    promise: Promise<PdfDoc>;
  };
};

async function extractTextItems(
  bytes: Buffer,
): Promise<{ items: TextItem[]; charCount: number }> {
  // Legacy build + main-thread (no worker) for Node.
  const pdfjs =
    (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
  }).promise;

  const items: TextItem[] = [];
  let charCount = 0;
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
  await doc.destroy();
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
    } catch {
      // Any failure (encrypted, malformed, Node/pdfjs issue) → fall back.
      return {
        parser: "pdf",
        confidence: 0.05,
        raw: { currency: input.hintCurrency ?? null, transactions: [] },
        meta: { error: "pdf-parse-failed" },
      };
    }

    if (charCount < DIGITAL_TEXT_THRESHOLD) {
      // Scanned/image PDF: no useful text layer → route to the Claude fallback.
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
