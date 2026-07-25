import { describe, expect, test } from "vitest";

import {
  MAX_UPLOAD_BYTES,
  scanUpload,
  validateUpload,
} from "@/lib/storage/uploads";

describe("upload validation", () => {
  test("accepts supported types and reports their kind", () => {
    expect(validateUpload({ filename: "statement.pdf", size: 100 })).toEqual({
      ok: true,
      kind: "pdf",
      extension: "pdf",
    });
    expect(validateUpload({ filename: "june.XLSX", size: 100 })).toMatchObject({
      ok: true,
      kind: "spreadsheet",
    });
    expect(validateUpload({ filename: "export.csv", size: 100 })).toMatchObject(
      {
        ok: true,
        kind: "csv",
      },
    );
    expect(validateUpload({ filename: "scan.jpg", size: 100 })).toMatchObject({
      ok: true,
      kind: "image",
    });
  });

  test("rejects empty, oversized, and unsupported files", () => {
    expect(validateUpload({ filename: "a.pdf", size: 0 }).ok).toBe(false);
    expect(
      validateUpload({ filename: "a.pdf", size: MAX_UPLOAD_BYTES + 1 }).ok,
    ).toBe(false);
    expect(validateUpload({ filename: "malware.exe", size: 10 }).ok).toBe(
      false,
    );
    expect(validateUpload({ filename: "noext", size: 10 }).ok).toBe(false);
  });

  test("scan hook passes by default", async () => {
    expect(await scanUpload(Buffer.from("data"))).toEqual({ clean: true });
  });
});
