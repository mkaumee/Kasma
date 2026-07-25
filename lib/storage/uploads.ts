import crypto from "node:crypto";

import { getStorage } from "@/lib/storage";
import { randomFileKey } from "@/lib/storage/keys";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

export type UploadKind = "pdf" | "spreadsheet" | "csv" | "image";

const EXTENSION_KIND: Record<string, UploadKind> = {
  pdf: "pdf",
  xlsx: "spreadsheet",
  xls: "spreadsheet",
  csv: "csv",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
};

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UploadError";
  }
}

export type UploadValidation =
  | { ok: true; kind: UploadKind; extension: string }
  | { ok: false; error: string };

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx >= 0 ? filename.slice(idx + 1).toLowerCase() : "";
}

/** Validate a file's name and size against the allowed types and limits. */
export function validateUpload(input: {
  filename: string;
  size: number;
}): UploadValidation {
  if (input.size <= 0) return { ok: false, error: "The file is empty." };
  if (input.size > MAX_UPLOAD_BYTES) {
    const mb = Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024);
    return { ok: false, error: `File is larger than ${mb} MB.` };
  }
  const extension = extensionOf(input.filename);
  const kind = EXTENSION_KIND[extension];
  if (!kind) {
    return {
      ok: false,
      error: "Unsupported file type. Upload a PDF, Excel, CSV, or image.",
    };
  }
  return { ok: true, kind, extension };
}

/**
 * Malware-scan hook. This is a stub that always passes; wire a real scanner
 * (e.g. ClamAV) here before accepting untrusted uploads in production.
 */
export async function scanUpload(
  _bytes: Buffer,
): Promise<{ clean: boolean; reason?: string }> {
  return { clean: true };
}

export type UploadInput = {
  filename: string;
  contentType: string;
  bytes: Buffer;
};

export type StoredUpload = {
  key: string;
  hash: string;
  size: number;
  contentType: string;
  filename: string;
  kind: UploadKind;
};

/**
 * Validate, scan, hash, and store an uploaded file under a tenant-scoped key.
 * Throws UploadError on validation/scan failure.
 */
export async function storeUpload(
  organizationId: string,
  folder: string,
  input: UploadInput,
): Promise<StoredUpload> {
  const validation = validateUpload({
    filename: input.filename,
    size: input.bytes.length,
  });
  if (!validation.ok) throw new UploadError(validation.error);

  const scan = await scanUpload(input.bytes);
  if (!scan.clean) {
    throw new UploadError(scan.reason ?? "File failed the malware scan.");
  }

  const hash = crypto.createHash("sha256").update(input.bytes).digest("hex");
  const key = randomFileKey(organizationId, folder, input.filename);
  await getStorage().put(key, input.bytes, { contentType: input.contentType });

  return {
    key,
    hash,
    size: input.bytes.length,
    contentType: input.contentType,
    filename: input.filename,
    kind: validation.kind,
  };
}
