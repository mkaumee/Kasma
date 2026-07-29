import { describe, expect, test } from "vitest";

import { describeExtraction, isEmptyExtraction } from "@/lib/extraction/diagnostics";
import { pdfParser } from "@/lib/extraction/parsers/pdf";
import { decideStatus } from "@/lib/extraction/pipeline";
import type { ParseResult } from "@/lib/extraction/types";
import type { ValidationResult } from "@/lib/extraction/validate";

/**
 * Extraction diagnostics. These exist because a real bug
 * (`doc.destroy is not a function`, which failed EVERY pdf upload) hid behind a
 * bare `catch {}` and a discarded `meta` for the life of the project. The
 * reason a file failed must reach a human.
 */

function result(meta: Record<string, unknown>, rows = 0): ParseResult {
  return {
    parser: "pdf",
    confidence: 0.05,
    raw: {
      currency: "USD",
      transactions: Array.from({ length: rows }, () => ({
        date: "2026-06-01",
        amount: "-1.00",
      })),
    },
    meta,
  };
}

describe("pdf parser — error binding", () => {
  test("a corrupt PDF yields a bound, non-empty error message", async () => {
    const res = await pdfParser.parse({
      bytes: Buffer.from("%PDF-1.4\nnot actually a pdf"),
      filename: "broken.pdf",
    });

    expect(res.confidence).toBe(0.05);
    expect(res.meta?.error).toBe("pdf-parse-failed");
    // The regression that made diagnosis impossible: these were thrown away.
    expect(typeof res.meta?.errorName).toBe("string");
    expect(String(res.meta?.errorMessage).length).toBeGreaterThan(0);
  });

  test("a valid text-layer PDF extracts rows (regression: doc.destroy)", async () => {
    // Minimal one-page PDF with a Helvetica text layer. Before the fix, calling
    // doc.destroy() — which does not exist on PDFDocumentProxy — threw AFTER a
    // successful extraction, so every PDF collapsed to pdf-parse-failed/0.05.
    const lines = [
      "Date        Description        Amount    Balance",
      "2026-06-01  Coffee Shop        -4.50     995.50",
      "2026-06-02  Salary Payment    2000.00   2995.50",
    ];
    let content = "BT /F1 11 Tf 40 750 Td 14 TL\n";
    for (const l of lines) content += `(${l}) Tj T*\n`;
    content += "ET";

    const objs = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ];
    let pdf = "%PDF-1.4\n";
    const offsets: number[] = [];
    objs.forEach((o, i) => {
      offsets.push(pdf.length);
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    });
    const xref = pdf.length;
    pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) pdf += `${String(o).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

    const res = await pdfParser.parse({
      bytes: Buffer.from(pdf, "latin1"),
      filename: "statement.pdf",
    });

    expect(res.meta?.error).toBeUndefined();
    expect(Number(res.meta?.charCount)).toBeGreaterThan(40);
    expect(res.confidence).toBeGreaterThan(0.6);
    expect(res.raw.transactions.length).toBeGreaterThan(0);
  });
});

describe("describeExtraction", () => {
  test("names a password-protected PDF explicitly", () => {
    const note = describeExtraction(
      result({ error: "pdf-parse-failed", encrypted: true }),
    );
    expect(note).toMatch(/password-protected/i);
  });

  test("includes the bound pdfjs error for other PDF failures", () => {
    const note = describeExtraction(
      result({
        error: "pdf-parse-failed",
        errorName: "TypeError",
        errorMessage: "doc.destroy is not a function",
      }),
    );
    expect(note).toContain("doc.destroy is not a function");
  });

  test("distinguishes a scan with no text from one with a little", () => {
    expect(describeExtraction(result({ scanned: true, charCount: 0 }))).toMatch(
      /scan or an image/i,
    );
    expect(describeExtraction(result({ scanned: true, charCount: 12 }))).toMatch(
      /12 characters/,
    );
  });

  test("passes a provider's own bow-out message through", () => {
    const note = describeExtraction(result({ unsupported: "DeepSeek is text-only." }));
    expect(note).toBe("DeepSeek is text-only.");
  });

  test("is null for a healthy extraction", () => {
    expect(describeExtraction(result({ charCount: 900 }, 5))).toBeNull();
  });
});

describe("isEmptyExtraction / decideStatus", () => {
  const okValidation = {
    ok: true,
    confidence: 0.98,
    breaks: [],
  } as unknown as ValidationResult;
  const failedValidation = {
    ok: false,
    confidence: 0.05,
    breaks: [],
  } as unknown as ValidationResult;

  test("nothing extracted at all → FAILED, not NEEDS_REVIEW", () => {
    expect(
      decideStatus({
        validation: failedValidation,
        dropped: 0,
        trustedTemplate: false,
        rowCount: 0,
        openingBalance: null,
        closingBalance: null,
      }),
    ).toBe("FAILED");
  });

  test("rows but nothing to verify against → still NEEDS_REVIEW", () => {
    expect(
      decideStatus({
        validation: failedValidation,
        dropped: 0,
        trustedTemplate: false,
        rowCount: 12,
        openingBalance: null,
        closingBalance: null,
      }),
    ).toBe("NEEDS_REVIEW");
  });

  test("no rows but balances were read → not a hard failure", () => {
    expect(
      decideStatus({
        validation: failedValidation,
        dropped: 0,
        trustedTemplate: false,
        rowCount: 0,
        openingBalance: 100n,
        closingBalance: 200n,
      }),
    ).toBe("NEEDS_REVIEW");
  });

  test("a clean reconciled statement is unaffected", () => {
    expect(
      decideStatus({
        validation: okValidation,
        dropped: 0,
        trustedTemplate: false,
        rowCount: 3,
        openingBalance: 100n,
        closingBalance: 200n,
      }),
    ).toBe("PARSED");
  });

  test("isEmptyExtraction only fires when truly nothing came back", () => {
    const base = { rowCount: 0, openingBalance: null, closingBalance: null };
    expect(isEmptyExtraction(base)).toBe(true);
    expect(isEmptyExtraction({ ...base, rowCount: 1 })).toBe(false);
    expect(isEmptyExtraction({ ...base, closingBalance: 5n })).toBe(false);
  });
});
