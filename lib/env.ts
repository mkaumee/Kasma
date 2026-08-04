import { z } from "zod";

/**
 * Server-side environment schema.
 *
 * Variables consumed by features that don't exist yet are `.optional()` for
 * now so the app builds and runs before those services are configured. As
 * each feature lands (database, auth, storage, extraction, email) its
 * variables are tightened to required at the point they're actually used.
 *
 * This module is shared by Next's server runtime AND the standalone worker
 * process, so it deliberately avoids `server-only` (which would crash the
 * worker). It must never be imported from a Client Component — the guard
 * below turns any such import into an immediate, obvious runtime error.
 * (Non-public `process.env` values are not inlined into client bundles by
 * Next, so no secret is leaked regardless; the guard just fails loudly.)
 */
if (typeof window !== "undefined") {
  throw new Error(
    "lib/env.ts is server-only and must not be imported from client code.",
  );
}

/**
 * Normalize raw environment values before validation.
 *
 * Values reaching `process.env` from a hosting platform are used verbatim, while
 * the same line in a `.env` file is parsed by dotenv, which trims it and strips
 * one layer of matched quotes. That asymmetry means `NODE_ENV="production"`
 * works locally and fails in production — and an empty string counts as "set",
 * so `.default()` never fires and a blank variable becomes a hard crash.
 *
 * This closes the gap: trim, strip one matched pair of surrounding quotes, and
 * treat the result as absent when empty. Nothing else is coerced — a genuinely
 * wrong value must still be rejected.
 */
export function normalizeEnv(
  raw: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== "string") {
      out[key] = value;
      continue;
    }
    let v = value.trim();
    if (
      v.length >= 2 &&
      ((v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'")))
    ) {
      v = v.slice(1, -1).trim();
    }
    out[key] = v === "" ? undefined : v;
  }
  return out;
}

const envSchema = z.object({
  // Nothing in the app reads `env.NODE_ENV` — the only consumers (Prisma log
  // level and the hot-reload guard in lib/db/client.ts) read `process.env`
  // directly and fall through safely on an unrecognized value. So an odd value
  // here must never take a process down: `.catch()` degrades to production (a
  // container with NODE_ENV set is a deployment) instead of throwing.
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development")
    .catch(({ value }) => {
      console.warn(
        `⚠️  NODE_ENV is ${JSON.stringify(value)}, which is not one of development | test | production. Continuing as "production".`,
      );
      return "production";
    }),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  // Database
  DATABASE_URL: z.string().min(1).optional(),

  // Auth
  AUTH_SECRET: z.string().min(1).optional(),

  // Object storage (local disk, S3-compatible, or Postgres)
  STORAGE_DRIVER: z.enum(["local", "s3", "db"]).optional(),
  LOCAL_STORAGE_DIR: z.string().min(1).default(".storage"),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),

  // Statement extraction (LLM fallback)
  // Which LLM provider to prefer for the fallback extractor. "auto" (default)
  // uses DeepSeek when its key is set, but routes images/scans to Claude when
  // available (DeepSeek is text-only). "deepseek"/"anthropic" pin a provider.
  EXTRACTION_PROVIDER: z
    .enum(["auto", "deepseek", "anthropic"])
    .default("auto"),

  // DeepSeek (default fallback provider), OpenAI-compatible chat completions.
  // NOTE: the legacy `deepseek-chat` / `deepseek-reasoner` IDs were discontinued
  // on 2026-07-24; the current models are deepseek-v4-pro and deepseek-v4-flash.
  // Override with DEEPSEEK_MODEL to run the cheaper flash tier.
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-pro"),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),

  // Anthropic (Claude): the vision provider for scanned PDFs and images.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Cost-efficient model for per-statement extraction (metered per org). The
  // top model is reserved for hard/low-confidence pages later.
  ANTHROPIC_EXTRACTION_MODEL: z.string().min(1).default("claude-sonnet-5"),
  // When true, mask likely account numbers before sending text to the LLM.
  LLM_REDACT_PII: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Email
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("Kasma <notifications@kasma.local>"),
});

/** Keys whose values must never be written to a log. */
const SECRET_KEY = /KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|DATABASE_URL/i;

/**
 * Render validation failures with the value that was actually received.
 *
 * Zod 4 dropped `received` from `invalid_value` issues — they carry only the
 * expected options — so printing `error.issues` can never explain what went
 * wrong. (That is exactly how a blank NODE_ENV crash-looped a worker while the
 * log helpfully listed the three values it already knew about.) The value is
 * therefore looked up from the raw input by path.
 *
 * Secrets report a length only; this text goes to deploy logs.
 */
export function describeEnvIssues(
  issues: readonly z.core.$ZodIssue[],
  raw: Record<string, string | undefined>,
): string {
  return issues
    .map((issue) => {
      const key = String(issue.path[0] ?? "(root)");
      const value = raw[key];

      let shown: string;
      if (SECRET_KEY.test(key)) {
        shown =
          value === undefined
            ? "missing"
            : value === ""
              ? "empty"
              : `set (${value.length} chars)`;
      } else {
        shown = value === undefined ? "missing" : JSON.stringify(value);
      }

      return `  ${key} — received ${shown}; ${issue.message}`;
    })
    .join("\n");
}

const rawEnv = normalizeEnv(process.env);
const parsed = envSchema.safeParse(rawEnv);

if (!parsed.success) {
  console.error(
    `❌ Invalid environment variables:\n${describeEnvIssues(parsed.error.issues, rawEnv)}\n`,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
export type Env = typeof env;
