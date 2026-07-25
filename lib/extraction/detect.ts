export type DetectedKind = "csv" | "xlsx" | "xls" | "pdf" | "image" | "unknown";

function hasPrefix(bytes: Buffer, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function looksLikeText(bytes: Buffer): boolean {
  const sample = bytes.subarray(0, 512);
  if (sample.length === 0) return false;
  let printable = 0;
  for (const byte of sample) {
    if (
      byte === 9 ||
      byte === 10 ||
      byte === 13 ||
      (byte >= 32 && byte < 127)
    ) {
      printable += 1;
    }
  }
  return printable / sample.length > 0.9;
}

/**
 * Detect a file's kind from magic bytes, falling back to the extension and a
 * text heuristic. PDF digital-vs-scanned is determined later, by the PDF parser.
 */
export function detectKind(
  bytes: Buffer,
  filename: string,
  _contentType?: string,
): DetectedKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";

  if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image"; // PNG
  if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) return "image"; // JPEG
  if (hasPrefix(bytes, [0xd0, 0xcf, 0x11, 0xe0])) return "xls"; // OLE2 (legacy .xls)

  // ZIP container: .xlsx (and other OOXML). Disambiguate by extension.
  if (hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (ext === "xlsx") return "xlsx";
    return "unknown";
  }

  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  if (ext === "xls") return "xls";
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "image";

  if (looksLikeText(bytes)) return "csv";
  return "unknown";
}
