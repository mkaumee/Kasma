import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ParseInput } from "@/lib/extraction/types";

/**
 * Provider selection for the LLM fallback dispatcher. `pickProvider` reads the
 * parsed env, so each case sets `process.env`, `vi.resetModules()`, then
 * dynamically imports the module.
 */

const CSV: ParseInput = {
  bytes: Buffer.from("Date,Description,Amount\n2026-06-01,Coffee,-4.50\n"),
  filename: "june.csv",
};
const IMAGE: ParseInput = {
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
  filename: "scan.png",
};

const KEYS = ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "EXTRACTION_PROVIDER"];

function setEnv(vars: Record<string, string | undefined>) {
  vi.resetModules();
  for (const k of KEYS) delete process.env[k];
  for (const [k, v] of Object.entries(vars)) {
    if (v !== undefined) process.env[k] = v;
  }
}

async function load() {
  return import("@/lib/extraction/llm");
}

afterEach(() => {
  for (const k of KEYS) delete process.env[k];
});

beforeEach(() => {
  vi.resetModules();
});

describe("pickProvider (LLM dispatch)", () => {
  test("auto + only DeepSeek → deepseek for text", async () => {
    setEnv({ DEEPSEEK_API_KEY: "d", EXTRACTION_PROVIDER: "auto" });
    const { pickProvider, isLlmAvailable } = await load();
    expect(isLlmAvailable()).toBe(true);
    expect(pickProvider(CSV)).toBe("deepseek");
  });

  test("auto + both keys → Claude for images (vision), DeepSeek for text", async () => {
    setEnv({
      DEEPSEEK_API_KEY: "d",
      ANTHROPIC_API_KEY: "a",
      EXTRACTION_PROVIDER: "auto",
    });
    const { pickProvider } = await load();
    expect(pickProvider(IMAGE)).toBe("anthropic");
    expect(pickProvider(CSV)).toBe("deepseek");
  });

  test("EXTRACTION_PROVIDER=anthropic pins Claude even for text", async () => {
    setEnv({
      DEEPSEEK_API_KEY: "d",
      ANTHROPIC_API_KEY: "a",
      EXTRACTION_PROVIDER: "anthropic",
    });
    const { pickProvider } = await load();
    expect(pickProvider(CSV)).toBe("anthropic");
  });

  test("provider=deepseek + no Claude → deepseek even for an image", async () => {
    setEnv({ DEEPSEEK_API_KEY: "d", EXTRACTION_PROVIDER: "deepseek" });
    const { pickProvider } = await load();
    expect(pickProvider(IMAGE)).toBe("deepseek");
  });

  test("only Anthropic configured → anthropic", async () => {
    setEnv({ ANTHROPIC_API_KEY: "a", EXTRACTION_PROVIDER: "auto" });
    const { pickProvider } = await load();
    expect(pickProvider(CSV)).toBe("anthropic");
  });

  test("no provider configured → unavailable, pickProvider null", async () => {
    setEnv({ EXTRACTION_PROVIDER: "auto" });
    const { pickProvider, isLlmAvailable } = await load();
    expect(isLlmAvailable()).toBe(false);
    expect(pickProvider(CSV)).toBeNull();
  });
});
