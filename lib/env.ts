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
const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),

  // Phase 1 — database
  DATABASE_URL: z.string().min(1).optional(),

  // Phase 2 — auth
  AUTH_SECRET: z.string().min(1).optional(),

  // Phase 5 — object storage (local disk, S3-compatible, or Postgres)
  STORAGE_DRIVER: z.enum(["local", "s3", "db"]).optional(),
  LOCAL_STORAGE_DIR: z.string().min(1).default(".storage"),
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_BUCKET: z.string().min(1).optional(),

  // Phase 6 — statement extraction (LLM fallback)
  // Which LLM provider to prefer for the fallback extractor. "auto" (default)
  // uses DeepSeek when its key is set, but routes images/scans to Claude when
  // available (DeepSeek is text-only). "deepseek"/"anthropic" pin a provider.
  EXTRACTION_PROVIDER: z
    .enum(["auto", "deepseek", "anthropic"])
    .default("auto"),

  // DeepSeek (default fallback provider) — OpenAI-compatible chat completions.
  // NOTE: the legacy `deepseek-chat` / `deepseek-reasoner` IDs were discontinued
  // on 2026-07-24; the current models are deepseek-v4-pro and deepseek-v4-flash.
  // Override with DEEPSEEK_MODEL to run the cheaper flash tier.
  DEEPSEEK_API_KEY: z.string().min(1).optional(),
  DEEPSEEK_MODEL: z.string().min(1).default("deepseek-v4-pro"),
  DEEPSEEK_BASE_URL: z.url().default("https://api.deepseek.com"),

  // Anthropic (Claude) — kept as the vision provider for scanned PDFs/images.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  // Cost-efficient model for per-statement extraction (metered per org). The
  // top model is reserved for hard/low-confidence pages later.
  ANTHROPIC_EXTRACTION_MODEL: z.string().min(1).default("claude-sonnet-5"),
  // When true, mask likely account numbers before sending text to the LLM.
  LLM_REDACT_PII: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  // Phase 12 — email
  RESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).default("Kasma <notifications@kasma.local>"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "❌ Invalid environment variables:\n",
    JSON.stringify(parsed.error.issues, null, 2),
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
export type Env = typeof env;
