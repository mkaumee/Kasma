/**
 * Diagnose why a PDF statement did or didn't extract.
 *
 *   pnpm tsx scripts/diagnose-pdf.ts path/to/statement.pdf
 *
 * Prints the extracted character count, a sample of the text, the detected
 * table columns, and — crucially — the bound pdfjs error when extraction fails.
 * Use this on the actual file rather than guessing from a confidence score.
 */
import { readFile } from "node:fs/promises";

import { detectKind } from "@/lib/extraction/detect";
import { pdfParser, extractPdfText } from "@/lib/extraction/parsers/pdf";

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: pnpm tsx scripts/diagnose-pdf.ts <file.pdf>");
    process.exit(1);
  }

  const bytes = await readFile(path);
  const filename = path.split("/").pop() ?? "statement.pdf";

  console.log(`\nFile:      ${filename}`);
  console.log(`Size:      ${(bytes.length / 1024).toFixed(1)} KiB`);
  console.log(`Detected:  ${detectKind(bytes, filename)}`);

  console.log("\n--- text layer ---");
  try {
    const { text, charCount } = await extractPdfText(bytes);
    console.log(`charCount: ${charCount}`);
    if (charCount === 0) {
      console.log(
        "No text at all. Either a scan, or the font data failed to decode.",
      );
    }
    console.log(`\nFirst 500 characters:\n${text.slice(0, 500)}`);
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAILED: ${name}: ${message}`);
    if (name === "PasswordException") {
      console.log("→ The PDF is password-protected.");
    }
  }

  console.log("\n--- parser result ---");
  const result = await pdfParser.parse({ bytes, filename });
  console.log(`parser:     ${result.parser}`);
  console.log(`confidence: ${result.confidence}`);
  console.log(`rows:       ${result.raw.transactions.length}`);
  console.log(`meta:       ${JSON.stringify(result.meta, null, 2)}`);

  const sample = result.raw.transactions.slice(0, 3);
  if (sample.length > 0) {
    console.log(`\nFirst rows:\n${JSON.stringify(sample, null, 2)}`);
  }
  console.log();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
