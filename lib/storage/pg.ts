import { prisma } from "@/lib/db/client";
import type { PutOptions, StorageProvider } from "@/lib/storage/types";

/**
 * Object storage backed by Postgres (STORAGE_DRIVER=db). Lets the app run on a
 * single database with no external object store — handy when the web app and
 * worker are separate services sharing one Postgres (e.g. on Railway). Files
 * are served through the authenticated /api/files route (no signed URLs).
 * Prefer S3 at scale; large blobs in Postgres are fine for MVP volumes.
 */
export class PgStorage implements StorageProvider {
  async put(key: string, data: Buffer, opts?: PutOptions): Promise<void> {
    // Prisma's Bytes maps to Uint8Array<ArrayBuffer>; copy to satisfy the type.
    const bytes = new Uint8Array(data);
    await prisma.storageObject.upsert({
      where: { key },
      create: {
        key,
        data: bytes,
        size: bytes.length,
        contentType: opts?.contentType ?? null,
      },
      update: {
        data: bytes,
        size: bytes.length,
        contentType: opts?.contentType ?? null,
      },
    });
  }

  async get(key: string): Promise<Buffer> {
    const row = await prisma.storageObject.findUnique({
      where: { key },
      select: { data: true },
    });
    if (!row) throw new Error(`Storage object not found: ${key}`);
    return Buffer.from(row.data);
  }

  async delete(key: string): Promise<void> {
    await prisma.storageObject.deleteMany({ where: { key } });
  }

  async exists(key: string): Promise<boolean> {
    const count = await prisma.storageObject.count({ where: { key } });
    return count > 0;
  }

  async getSignedUrl(): Promise<string | null> {
    // Served through the authenticated app route (no direct signed URLs).
    return null;
  }
}
