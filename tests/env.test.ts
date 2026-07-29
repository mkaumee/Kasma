import { afterEach, describe, expect, test, vi } from "vitest";

import { describeEnvIssues, normalizeEnv } from "@/lib/env";

/**
 * Environment validation. This file had no test at all until a blank NODE_ENV —
 * a variable nothing in the app actually reads — crash-looped the worker in
 * production while the log printed only the three values it already expected.
 *
 * Two properties matter here: values injected by a hosting platform must behave
 * like the same line in a .env file, and a failure must name what it received.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("normalizeEnv", () => {
  test("strips one matched pair of surrounding quotes", () => {
    // Pasting a .env-style block into a platform UI stores the quotes verbatim.
    expect(normalizeEnv({ NODE_ENV: '"production"' }).NODE_ENV).toBe("production");
    expect(normalizeEnv({ NODE_ENV: "'production'" }).NODE_ENV).toBe("production");
  });

  test("trims surrounding whitespace", () => {
    expect(normalizeEnv({ X: "  production  " }).X).toBe("production");
    expect(normalizeEnv({ X: '  "production"  ' }).X).toBe("production");
  });

  test("treats empty and whitespace-only as absent, so defaults fire", () => {
    // The specific reason the worker died: "" is *set*, so .default() never ran.
    expect(normalizeEnv({ X: "" }).X).toBeUndefined();
    expect(normalizeEnv({ X: "   " }).X).toBeUndefined();
    expect(normalizeEnv({ X: '""' }).X).toBeUndefined();
  });

  test("leaves inner and unmatched quotes alone", () => {
    expect(normalizeEnv({ X: "it's" }).X).toBe("it's");
    expect(normalizeEnv({ X: '"unbalanced' }).X).toBe('"unbalanced');
    expect(normalizeEnv({ X: 'say "hi" now' }).X).toBe('say "hi" now');
  });

  test("does not otherwise coerce values", () => {
    // A genuinely wrong value must still reach the schema and be rejected.
    expect(normalizeEnv({ X: "Production" }).X).toBe("Production");
    expect(normalizeEnv({ X: "postgresql://u:p@h:5432/db" }).X).toBe(
      "postgresql://u:p@h:5432/db",
    );
  });

  test("passes through non-string values untouched", () => {
    expect(normalizeEnv({ X: undefined }).X).toBeUndefined();
  });
});

describe("NODE_ENV resilience", () => {
  // Next's types mark process.env.NODE_ENV read-only; write through a plain
  // record view so the test can exercise the values a platform really injects.
  const penv = process.env as unknown as Record<string, string | undefined>;

  async function loadWith(value: string | undefined) {
    vi.resetModules();
    const previous = penv.NODE_ENV;
    if (value === undefined) delete penv.NODE_ENV;
    else penv.NODE_ENV = value;
    try {
      return (await import("@/lib/env")).env;
    } finally {
      penv.NODE_ENV = previous;
    }
  }

  test("a blank NODE_ENV falls back to the default instead of crashing", async () => {
    const env = await loadWith("");
    expect(env.NODE_ENV).toBe("development");
  });

  test("a quoted NODE_ENV is accepted", async () => {
    const env = await loadWith('"production"');
    expect(env.NODE_ENV).toBe("production");
  });

  test("an unrecognized NODE_ENV warns and degrades, never throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const env = await loadWith("staging");
    expect(env.NODE_ENV).toBe("production");
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0]?.[0])).toContain("staging");
  });

  test("a valid NODE_ENV is passed through unchanged", async () => {
    expect((await loadWith("production")).NODE_ENV).toBe("production");
    expect((await loadWith("test")).NODE_ENV).toBe("test");
  });
});

describe("describeEnvIssues", () => {
  const issue = (key: string, message: string) =>
    ({ path: [key], message, code: "invalid_value" }) as never;

  test("shows the received value for a non-secret key", () => {
    const out = describeEnvIssues([issue("NODE_ENV", "expected one of …")], {
      NODE_ENV: "staging",
    });
    expect(out).toContain("NODE_ENV");
    expect(out).toContain('"staging"');
    expect(out).toContain("expected one of");
  });

  test("makes a stray quote or trailing space visible", () => {
    const out = describeEnvIssues([issue("STORAGE_DRIVER", "bad")], {
      STORAGE_DRIVER: '"db" ',
    });
    // JSON-quoted so whitespace and embedded quotes are unmistakable.
    expect(out).toContain('"\\"db\\" "');
  });

  test("never prints a secret's value", () => {
    const secret = "sk-super-secret-value-12345";
    const out = describeEnvIssues(
      [
        issue("DEEPSEEK_API_KEY", "bad"),
        issue("AUTH_SECRET", "bad"),
        issue("DATABASE_URL", "bad"),
      ],
      {
        DEEPSEEK_API_KEY: secret,
        AUTH_SECRET: "hunter2hunter2",
        DATABASE_URL: "postgresql://user:pw@host/db",
      },
    );
    expect(out).not.toContain(secret);
    expect(out).not.toContain("hunter2hunter2");
    expect(out).not.toContain("pw@host");
    // …but still says enough to act on.
    expect(out).toContain(`set (${secret.length} chars)`);
  });

  test("distinguishes missing from empty", () => {
    expect(describeEnvIssues([issue("AUTH_SECRET", "bad")], {})).toContain(
      "missing",
    );
    expect(
      describeEnvIssues([issue("AUTH_SECRET", "bad")], { AUTH_SECRET: "" }),
    ).toContain("empty");
    expect(describeEnvIssues([issue("NODE_ENV", "bad")], {})).toContain("missing");
  });

  test("reports every failing key, one per line", () => {
    const out = describeEnvIssues(
      [issue("NODE_ENV", "a"), issue("S3_ENDPOINT", "b")],
      { NODE_ENV: "x", S3_ENDPOINT: "not-a-url" },
    );
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain("not-a-url");
  });
});
