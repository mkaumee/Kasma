import fs from "node:fs/promises";
import path from "node:path";

import type { StorageProvider } from "@/lib/storage/types";

/** Object storage backed by the local filesystem (development default). */
export class LocalStorage implements StorageProvider {
  constructor(private readonly baseDir: string) {}

  private resolve(key: string): string {
    const base = path.resolve(this.baseDir);
    const target = path.resolve(base, key);
    // Guard against path traversal (keys must stay under baseDir).
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error("Invalid storage key");
    }
    return target;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(key));
      return true;
    } catch {
      return false;
    }
  }

  async getSignedUrl(): Promise<string | null> {
    // Local files are served through the authenticated app route.
    return null;
  }
}
