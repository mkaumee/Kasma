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
  // Leave DEEPSEEK_MODEL unset so tests exercise the shipped default.
  delete process.env.DEEPSEEK_MODEL;
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

    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    // The legacy deepseek-chat ID was retired 2026-07-24; default must be V4.
    expect(sent.model).toBe("deepseek-v4-pro");
    expect(sent.response_format).toEqual({ type: "json_object" });
    expect(sent.temperature).toBe(0);
    // Thinking must be disabled EXPLICITLY. V4 Pro enables it by default and
    // charges reasoning tokens against max_tokens, so leaving it on lets the
    // model exhaust the budget reasoning and return no content at all. An
    // earlier version of this test asserted the key was absent, which locked
    // that failure in.
    expect(sent.thinking).toEqual({ type: "disabled" });
    // Room for a long statement — the old 8K cap truncated the JSON.
    expect(sent.max_tokens).toBeGreaterThanOrEqual(64_000);
    // JSON mode requires the word "json" somewhere in the prompt.
    const messages = sent.messages as { role: string; content: string }[];
    expect(messages[0]!.content.toLowerCase()).toContain("json");

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

  test("finish_reason 'length' is reported as truncation, not a parse failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          // Cut off mid-object: JSON.parse would throw a misleading error.
          choices: [
            {
              message: { content: '{"transactions":[{"date":"2026-06-01"' },
              finish_reason: "length",
            },
          ],
        }),
        text: async () => "",
      })),
    );

    const { deepseekExtract } = await loadModule();
    const res = await deepseekExtract(csvInput());
    expect(res.meta?.error).toBe("deepseek-truncated");
    expect(res.confidence).toBeLessThan(0.1);
    expect(res.raw.transactions).toHaveLength(0);
  });

  test("reads message.content, never reasoning_content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                reasoning_content: '{"transactions":[{"description":"WRONG"}]}',
                content: JSON.stringify({
                  transactions: [
                    { date: "2026-06-01", description: "RIGHT", amount: "-1.00" },
                  ],
                }),
              },
              finish_reason: "stop",
            },
          ],
        }),
        text: async () => "",
      })),
    );

    const { deepseekExtract } = await loadModule();
    const res = await deepseekExtract(csvInput());
    expect(res.raw.transactions[0]!.description).toBe("RIGHT");
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
