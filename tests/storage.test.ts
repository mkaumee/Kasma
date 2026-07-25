import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, test } from "vitest";

import {
  keyBelongsToOrg,
  orgIdFromKey,
  statementFileKey,
} from "@/lib/storage/keys";
import { LocalStorage } from "@/lib/storage/local";

const dir = path.join(os.tmpdir(), `kasma-storage-${crypto.randomUUID()}`);
const storage = new LocalStorage(dir);

afterAll(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("storage keys", () => {
  test("tenant-scoped keys and ownership checks", () => {
    const key = statementFileKey("org1", "stmt1", "June Statement.pdf");
    expect(key).toBe("orgs/org1/statements/stmt1/June_Statement.pdf");
    expect(orgIdFromKey(key)).toBe("org1");
    expect(keyBelongsToOrg(key, "org1")).toBe(true);
    expect(keyBelongsToOrg(key, "org2")).toBe(false);
  });

  test("filename traversal is stripped from key segments", () => {
    const key = statementFileKey("org1", "s1", "../../etc/passwd");
    expect(key.includes("..")).toBe(false);
  });
});

describe("local storage", () => {
  test("put/get/exists/delete round-trip", async () => {
    const key = "orgs/o1/statements/s1/test.txt";
    expect(await storage.exists(key)).toBe(false);
    await storage.put(key, Buffer.from("hello"));
    expect(await storage.exists(key)).toBe(true);
    expect((await storage.get(key)).toString()).toBe("hello");
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  test("rejects path traversal in the key", async () => {
    await expect(
      storage.put("../escape.txt", Buffer.from("x")),
    ).rejects.toThrow("Invalid storage key");
  });
});
