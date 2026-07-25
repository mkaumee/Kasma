export type PutOptions = { contentType?: string };

/** Backend-agnostic object storage. Implemented by local disk and S3. */
export interface StorageProvider {
  put(key: string, data: Buffer, opts?: PutOptions): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  /**
   * A presigned URL for direct GET access, or null when the backend has no
   * signed URLs (local disk) and the app should serve the bytes itself.
   */
  getSignedUrl(key: string, expiresSeconds?: number): Promise<string | null>;
}
