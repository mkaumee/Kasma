import { describe, expect, test } from "vitest";

import { formatLine } from "@/lib/log";

describe("formatLine", () => {
  test("emits a JSON line with level, msg, fields, and timestamp", () => {
    const at = new Date("2026-06-01T00:00:00.000Z");
    const line = formatLine("info", "statement processed", { inserted: 3 }, at);
    const parsed = JSON.parse(line);
    expect(parsed).toEqual({
      level: "info",
      msg: "statement processed",
      inserted: 3,
      ts: "2026-06-01T00:00:00.000Z",
    });
  });

  test("works without fields", () => {
    const parsed = JSON.parse(formatLine("error", "boom"));
    expect(parsed.level).toBe("error");
    expect(parsed.msg).toBe("boom");
    expect(typeof parsed.ts).toBe("string");
  });
});
