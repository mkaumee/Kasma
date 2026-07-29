import type { ParseResult } from "@/lib/extraction/types";

/**
 * Turn an extractor's `meta` into one plain-English sentence explaining why a
 * statement produced little or nothing.
 *
 * This exists because the reason used to be computed three times (in the PDF
 * parser, in DeepSeek's buildText, in the metadata pass) and discarded three
 * times: a bare `catch {}`, a `meta` object nobody persisted, and an
 * ImportJob.error explicitly overwritten with null on success. A real bug
 * (`doc.destroy is not a function`, which broke every PDF upload) sat invisible
 * behind that for exactly as long as it took to bind one error.
 *
 * Written for the person reading it in the UI, not for a log parser.
 */
export function describeExtraction(result: ParseResult): string | null {
  const meta = result.meta ?? {};
  const rows = result.raw.transactions.length;

  const unsupported = meta.unsupported;
  if (typeof unsupported === "string") return unsupported;

  const error = meta.error;
  if (typeof error === "string") {
    if (error === "pdf-parse-failed") {
      if (meta.encrypted === true) {
        return "This PDF is password-protected, so its contents can't be read. Re-save it without a password and upload again.";
      }
      const detail =
        typeof meta.errorMessage === "string" && meta.errorMessage.trim() !== ""
          ? ` (${meta.errorName ?? "Error"}: ${meta.errorMessage})`
          : "";
      return `The PDF could not be opened${detail}.`;
    }
    if (error === "deepseek-truncated") {
      return "The statement was too long for the extractor to return in one response. Try splitting it into shorter periods.";
    }
    if (error === "deepseek-parse-empty" || error === "claude-parse-empty") {
      return "The extractor did not return usable data for this statement.";
    }
    return `Extraction failed: ${error}.`;
  }

  if (meta.scanned === true) {
    const chars = typeof meta.charCount === "number" ? meta.charCount : 0;
    return chars === 0
      ? "No text could be read from this PDF — it looks like a scan or an image. Text-only extraction can't read it."
      : `Only ${chars} characters of text could be read from this PDF, which isn't enough to find transactions.`;
  }

  if (rows === 0) {
    return "No transactions were found in this file. It may not be a bank statement, or its layout wasn't recognized.";
  }

  return null;
}

/**
 * Whether extraction produced nothing usable at all — as distinct from "parsed
 * fine but there's no balance to verify against". The former is a failure with
 * nothing to review; the latter is a genuine review task.
 */
export function isEmptyExtraction(inputs: {
  rowCount: number;
  openingBalance: bigint | null;
  closingBalance: bigint | null;
}): boolean {
  return (
    inputs.rowCount === 0 &&
    inputs.openingBalance == null &&
    inputs.closingBalance == null
  );
}
