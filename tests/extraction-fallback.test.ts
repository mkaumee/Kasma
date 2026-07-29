import { beforeEach, describe, expect, test, vi } from "vitest";

// Mock the LLM dispatcher so orchestration is tested without a live API key.
vi.mock("@/lib/extraction/llm", () => ({
  isLlmAvailable: vi.fn(() => false),
  llmExtract: vi.fn(),
}));

import { isLlmAvailable, llmExtract } from "@/lib/extraction/llm";
// Importing the barrel registers the deterministic parsers.
import { parseStatement } from "@/lib/extraction/parsers";
import type { ParseInput, ParseResult } from "@/lib/extraction/types";

const mockAvailable = vi.mocked(isLlmAvailable);
const mockExtract = vi.mocked(llmExtract);

const llmResult: ParseResult = {
  parser: "deepseek",
  confidence: 0.7,
  raw: {
    currency: "USD",
    transactions: [{ date: "2026-06-01", description: "X", amount: "-4.50" }],
  },
};

function input(text: string, filename: string): ParseInput {
  return { bytes: Buffer.from(text), filename, hintCurrency: "USD" };
}

const GOOD_CSV =
  "Date,Description,Amount\n2026-06-01,Coffee,-4.50\n2026-06-02,Salary,2000.00\n";
const WEAK_TEXT = "random text line one\nrandom text line two\n";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);

describe("parseStatement orchestration + LLM fallback", () => {
  beforeEach(() => {
    mockAvailable.mockReset();
    mockExtract.mockReset();
    mockAvailable.mockReturnValue(false);
  });

  test("high-confidence deterministic parse never calls the LLM", async () => {
    const res = await parseStatement(input(GOOD_CSV, "june.csv"));
    expect(res.parser).toBe("csv");
    expect(res.confidence).toBeGreaterThanOrEqual(0.6);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  test("no deterministic parser + LLM available → LLM result", async () => {
    mockAvailable.mockReturnValue(true);
    mockExtract.mockResolvedValue(llmResult);
    const res = await parseStatement({
      bytes: PNG,
      filename: "scan.png",
      hintCurrency: "USD",
    });
    expect(res.parser).toBe("deepseek");
    expect(mockExtract).toHaveBeenCalledOnce();
  });

  test("no deterministic parser + LLM unavailable → throws", async () => {
    await expect(
      parseStatement({ bytes: PNG, filename: "scan.png" }),
    ).rejects.toThrow(/No parser available/);
    expect(mockExtract).not.toHaveBeenCalled();
  });

  test("low-confidence deterministic yields to a higher LLM score", async () => {
    mockAvailable.mockReturnValue(true);
    mockExtract.mockResolvedValue(llmResult);
    const res = await parseStatement(input(WEAK_TEXT, "mystery.csv"));
    expect(res.parser).toBe("deepseek");
    expect(mockExtract).toHaveBeenCalledOnce();
  });

  test("LLM failure falls back to the deterministic result", async () => {
    mockAvailable.mockReturnValue(true);
    mockExtract.mockRejectedValue(new Error("network down"));
    const res = await parseStatement(input(WEAK_TEXT, "mystery.csv"));
    expect(res.parser).toBe("csv");
  });
});
