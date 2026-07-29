import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { ParseInput } from "@/lib/extraction/types";

/**
 * DeepSeek extractor tests. `lib/env.ts` parses `process.env` at module load,
 * so we set the DeepSeek vars and `vi.resetModules()` before importing the
 * module under test, then dynamically import it inside each test.
 */

function csvInput(): ParseInput {
  return {
    bytes: Buffer.from(
      "Date,Description,Amount\n2026-06-01,Coffee,-4.50\n2026-06-02,Salary,2000\n",
    ),
    filename: "june.csv",
    hintCurrency: "USD",
  };
}

const PNG: ParseInput = {
  bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]),
  filename: "scan.png",
  hintCurrency: "USD",
};

/** A DeepSeek chat-completions response wrapping a JSON statement string. */
function deepSeekResponse(statement: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(statement) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    }),
    text: async () => "",
  };
}

async function loadModule() {
  return import("@/lib/extraction/deepseek");
}

beforeEach(() => {
  vi.resetModules();
  process.env.DEEPSEEK_API_KEY = "test-key";
  process.env.DEEPSEEK_MODEL = "deepseek-chat";
  process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.com";
  process.env.EXTRACTION_PROVIDER = "deepseek";
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.DEEPSEEK_MODEL;
  delete process.env.DEEPSEEK_BASE_URL;
  delete process.env.EXTRACTION_PROVIDER;
});

describe("DeepSeek extractor", () => {
  test("isDeepSeekAvailable reflects the API key", async () => {
    const { isDeepSeekAvailable } = await loadModule();
    expect(isDeepSeekAvailable()).toBe(true);
  });

  test("maps the DeepSeek JSON completion to a RawStatement", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      deepSeekResponse({
        bankName: "Test Bank",
        accountLast4: "1234",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
        openingBalance: "100.00",
        closingBalance: "2095.50",
        currency: "USD",
        transactions: [
          { date: "2026-06-01", description: "Coffee", amount: "-4.50" },
          // Amount as a number — should be coerced to a string, not dropped.
          { date: "2026-06-02", description: "Salary", amount: 2000 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { deepseekExtract } = await loadModule();
    const res = await deepseekExtract(csvInput());

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.deepseek.com/chat/completions");
    expect(init?.method).toBe("POST");

    expect(res.parser).toBe("deepseek");
    expect(res.confidence).toBeGreaterThan(0.5);
    expect(res.raw.bankName).toBe("Test Bank");
    expect(res.raw.currency).toBe("USD");
    expect(res.raw.transactions).toHaveLength(2);
    expect(res.raw.transactions[1]!.amount).toBe("2000");
    expect(res.meta?.rawResponse).toContain("Salary");
  });

  test("falls back to the currency hint when the model omits currency", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        deepSeekResponse({
          transactions: [{ date: "2026-06-01", description: "X", amount: "-1.00" }],
        }),
      ),
    );
    const { deepseekExtract } = await loadModule();
    const res = await deepseekExtract(csvInput());
    expect(res.raw.currency).toBe("USD");
  });

  test("images are unsupported (text-only) and never hit the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { deepseekExtract } = await loadModule();
    const res = await deepseekExtract(PNG);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(res.parser).toBe("deepseek");
    expect(res.confidence).toBeLessThan(0.1);
    expect(res.raw.transactions).toHaveLength(0);
    expect(res.meta?.unsupported).toMatch(/text-only/i);
  });
});
