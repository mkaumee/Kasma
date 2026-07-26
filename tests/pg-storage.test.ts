import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { prisma } from "@/lib/db/client";
import { PgStorage } from "@/lib/storage/pg";

import { resetDb } from "./helpers/db";

const storage = new PgStorage();
const key = `orgs/test/statements/${crypto.randomUUID()}/june.csv`;
const bytes = Buffer.from("Date,Description,Amount\n2026-06-01,Coffee,-4.50\n");

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("PgStorage", () => {
  test("put → exists → get round-trips the exact bytes", async () => {
    expect(await storage.exists(key)).toBe(false);
    await storage.put(key, bytes, { contentType: "text/csv" });
    expect(await storage.exists(key)).toBe(true);

    const read = await storage.get(key);
    expect(Buffer.isBuffer(read)).toBe(true);
    expect(read.equals(bytes)).toBe(true);
  });

  test("put overwrites in place", async () => {
    const next = Buffer.from("updated");
    await storage.put(key, next);
    expect((await storage.get(key)).equals(next)).toBe(true);
  });

  test("delete removes it; get then throws", async () => {
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
    await expect(storage.get(key)).rejects.toThrow(/not found/i);
  });

  test("getSignedUrl is null (served via the app route)", async () => {
    expect(await storage.getSignedUrl()).toBeNull();
  });
});
