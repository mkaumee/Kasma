import { describe, expect, test } from "vitest";

import { detectKind } from "@/lib/extraction/detect";

describe("detectKind", () => {
  test("detects PDF by magic bytes regardless of name", () => {
    const pdf = Buffer.from("%PDF-1.7\n...");
    expect(detectKind(pdf, "statement")).toBe("pdf");
  });

  test("detects images", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    expect(detectKind(png, "scan.png")).toBe("image");
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectKind(jpg, "scan.jpg")).toBe("image");
  });

  test("detects xlsx (zip + extension) and legacy xls (OLE)", () => {
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(detectKind(zip, "june.xlsx")).toBe("xlsx");
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    expect(detectKind(ole, "june.xls")).toBe("xls");
  });

  test("detects CSV from plain text content", () => {
    const csv = Buffer.from(
      "Date,Description,Amount\n2026-06-01,Coffee,-4.50\n",
    );
    expect(detectKind(csv, "export")).toBe("csv");
  });

  test("falls back to extension, then unknown", () => {
    expect(detectKind(Buffer.from([0x00, 0x01, 0x02]), "file.csv")).toBe("csv");
    expect(detectKind(Buffer.from([0x00, 0x01, 0x02]), "mystery.bin")).toBe(
      "unknown",
    );
  });
});
