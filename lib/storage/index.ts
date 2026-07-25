import { env } from "@/lib/env";
import { LocalStorage } from "@/lib/storage/local";
import { S3Storage } from "@/lib/storage/s3";
import type { StorageProvider } from "@/lib/storage/types";

let instance: StorageProvider | undefined;

/**
 * The storage backend for this process. Uses S3 when STORAGE_DRIVER=s3 or when
 * S3 credentials are present; otherwise falls back to local disk.
 */
export function getStorage(): StorageProvider {
  if (instance) return instance;

  const s3Configured =
    Boolean(env.S3_BUCKET) &&
    Boolean(env.S3_ACCESS_KEY_ID) &&
    Boolean(env.S3_SECRET_ACCESS_KEY);
  const useS3 =
    env.STORAGE_DRIVER === "s3" || (!env.STORAGE_DRIVER && s3Configured);

  if (useS3) {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage selected but not fully configured.");
    }
    instance = new S3Storage({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? "us-east-1",
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      bucket: env.S3_BUCKET,
    });
  } else {
    instance = new LocalStorage(env.LOCAL_STORAGE_DIR);
  }

  return instance;
}

export type { StorageProvider } from "@/lib/storage/types";
export * from "@/lib/storage/keys";
