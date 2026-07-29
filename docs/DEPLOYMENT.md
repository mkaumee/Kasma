# Kasma — Deployment Guide

Kasma is a Next.js (App Router) app plus a standalone background **worker**,
backed by PostgreSQL and S3-compatible object storage. This guide covers a
production deployment.

## Components

| Component | What it is | Where it runs |
|-----------|------------|---------------|
| **Web app** | Next.js server (UI + server actions + route handlers) | Vercel, or any Node host |
| **Worker** | `pnpm worker` — pg-boss consumer running the statement pipeline | A **persistent** host (Railway/Fly/ECS) — *not* serverless; parse jobs are long-running |
| **PostgreSQL 16** | Primary datastore + the pg-boss job queue | Managed Postgres (Neon/Supabase/RDS) |
| **Object storage** | Statement files + evidence | S3-compatible bucket (or local disk in dev) |

## Environment variables

Copy `.env.example` and fill in:

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (used by the app, the worker, and pg-boss). |
| `AUTH_SECRET` | ✅ | `openssl rand -base64 32`. Signs session JWTs. |
| `NEXT_PUBLIC_APP_URL` | ✅ | Public base URL, e.g. `https://kasma.example.com`. |
| `STORAGE_DRIVER` | prod | `s3` (object storage), `db` (Postgres — no external store), or unset for local disk (dev only). |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | with S3 | Object storage credentials (only when `STORAGE_DRIVER=s3`). |
| `EXTRACTION_PROVIDER` | optional | LLM fallback preference: `auto` (default — DeepSeek for text, Claude for scans/images when configured), `deepseek`, or `anthropic`. |
| `DEEPSEEK_API_KEY` | optional | Enables the DeepSeek extractor (default provider) for CSV/text and digital PDFs, and the statement-metadata pass below. Text-only — cannot read scanned PDFs/images. |
| `DEEPSEEK_MODEL` / `DEEPSEEK_BASE_URL` | optional | Default `deepseek-v4-pro` / `https://api.deepseek.com`. Set `deepseek-v4-flash` for a cheaper, faster tier. The legacy `deepseek-chat` / `deepseek-reasoner` IDs were **retired 2026-07-24** and will fail. |
| `ANTHROPIC_API_KEY` | optional | Enables the Claude vision fallback for scanned PDFs/images DeepSeek can't read. Without any LLM key, the deterministic CSV/Excel/PDF parsers still run. |
| `ANTHROPIC_EXTRACTION_MODEL` | optional | Defaults to a cost-efficient model. |
| `LLM_REDACT_PII` | optional | `true` (default) masks likely account numbers before sending text to any LLM. |
| `RESEND_API_KEY` | optional | Enables outbound email. Without it, notifications still land in-app; email is skipped. |
| `EMAIL_FROM` | optional | From address for outbound email. |

**Secrets never ship to the client** — only `NEXT_PUBLIC_*` values are exposed
to the browser, and `lib/env.ts` fails fast on invalid configuration.

### Statement balances (why an LLM key matters)

A statement is verified against its own running balance, so Kasma needs an
opening and closing figure. It gets them in this order:

1. **From the statement**, when a parser reads them directly.
2. **Derived from the rows'** running-balance column, when there is one. These
   are marked as derived: if *both* ends are derived, `opening + Σamounts ==
   closing` is true by construction, so it is **not** treated as verification.
3. **Read by the LLM** — when 1 and 2 leave nothing checkable, the extractor
   sends just the head and tail of the document (where banks print
   "Opening/Closing Balance") and asks for those figures only. This is one small
   call, skipped whenever the balances are already known.
4. **Corrected by a reviewer** in the statement review screen, if a figure is
   wrong. Never required at upload.

Without any LLM key, steps 1–2 still run, but statements whose balances are only
printed in a summary block will land in **needs-review** with nothing to verify
against. Setting `DEEPSEEK_API_KEY` on the **worker** is what enables step 3.

## First deploy

1. **Provision** Postgres and (for production) an S3 bucket.
2. **Run migrations**: `pnpm db:migrate:deploy` (applies `prisma/migrations`).
3. **Build** the web app: `pnpm build`, then start it: `pnpm start`.
4. **Start the worker** on a persistent host: `pnpm worker`.
5. (Optional) **Seed a demo org**: `pnpm db:seed`
   (login: `owner@kasma.dev` / `password123!`).

## Health checks

`GET /api/health` returns `200 {"status":"ok"}` when the app and database are
reachable, `503` otherwise — wire it to your load balancer / uptime monitor.

## Deploying on Railway

Kasma runs well on Railway as **two services from this one repo** (web + worker)
plus a Postgres plugin. Config-as-code lives in `railway.json` (web) and
`railway.worker.json` (worker).

> **File storage must be shared between the two services** (the web app writes
> uploads; the worker reads them to parse). They cannot share a local disk /
> volume, so pick one of:
>
> - **`STORAGE_DRIVER=db`** — store files in the Postgres you already run. No
>   external bucket, no extra credentials; simplest for a Railway deploy.
>   Best for small/medium volumes.
> - **`STORAGE_DRIVER=s3`** — an S3-compatible bucket (Cloudflare R2, AWS S3,
>   Backblaze B2, or a MinIO service). Preferred at scale.
>
> The local-disk driver only works for single-process local dev.

**Steps**

1. **New project → Add Postgres.** Railway provisions it and exposes
   `DATABASE_URL`.
2. **Add the web service** from this repo. In its settings set the config file
   to `railway.json` (start = migrate + `next start`, health check
   `/api/health`).
3. **Add a second service** from the *same* repo for the worker; set its config
   file to `railway.worker.json` (start = `pnpm worker`, no HTTP health check).
4. **Choose storage** — set `STORAGE_DRIVER=db` to keep files in Postgres
   (nothing else to provision), or provision an S3-compatible bucket and use
   `STORAGE_DRIVER=s3` with its credentials.
5. **Set variables on BOTH services** (worker needs DB + storage + the LLM key;
   web needs all of it):

   > **A platform variables UI is not a `.env` file.** Enter values **unquoted**.
   > A `.env` file is parsed by dotenv, which strips surrounding quotes; Railway
   > stores exactly what you type, so `NODE_ENV="production"` becomes the
   > 12-character string *including the quotes*. Kasma now trims and unquotes
   > values defensively, but other tools in your stack won't.

   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   AUTH_SECRET=<openssl rand -base64 32>
   NEXT_PUBLIC_APP_URL=https://<your-web-domain>
   STORAGE_DRIVER=db          # store files in Postgres — no external bucket
   # …or use object storage instead:
   #   STORAGE_DRIVER=s3
   #   S3_ENDPOINT / S3_REGION / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY / S3_BUCKET
   # optional — LLM fallback extractor (deterministic parsers run without it)
   DEEPSEEK_API_KEY=<key>     # default provider (text-only: CSV/text + digital PDFs)
   # ANTHROPIC_API_KEY=<key>  # add for vision (scanned PDFs / images)
   RESEND_API_KEY=<key>
   EMAIL_FROM=Kasma <notifications@yourdomain>
   ```

   Reference Postgres with `${{Postgres.DATABASE_URL}}` so both services share
   the same database (the pg-boss queue also lives there — no Redis needed).

   **`NODE_ENV` is not required** and should be left unset — nothing in the app
   reads it. If your platform injects a blank or unexpected value, Kasma logs a
   warning and continues rather than refusing to start.
6. **Deploy.** The web service's start command runs `prisma migrate deploy`
   before `next start`, so migrations apply automatically. Railway probes
   `/api/health` until the app + DB are ready.
7. (Optional) **Seed a demo org** from the web service shell:
   `pnpm db:seed`.

Scale the worker to ≥ 1 instance (it holds the pg-boss subscription). Keep the
web service to a single instance unless you move migrations out of the start
command (otherwise replicas race to migrate); Railway's pre-deploy command is
a good place for `pnpm db:migrate:deploy` once you scale out.

## Operational notes

- **Migrations** run on deploy (`db:migrate:deploy`); never `migrate dev` in
  production.
- **The worker is stateful-ish** — it holds the pg-boss subscription. Run at
  least one instance; scale horizontally as parse volume grows.
- **Rate limiting** is in-memory (per instance). For multi-instance auth/upload
  throttling, back `lib/security/rate-limit.ts` with Redis/Upstash.
- **Logs** are structured JSON (`lib/log.ts`) — ship stdout to your aggregator.
  The worker's `statement processed` line carries `parser`, `confidence`, and a
  `note` explaining any statement that produced little or nothing.
- **A statement that won't extract**: the reason is shown on the statement page
  and stored in `Statement.extractionNote`. To dig into a specific file, run
  `pnpm diagnose:pdf path/to/statement.pdf` — it prints the extracted character
  count, a text sample, the detected columns, and the raw pdfjs error.
- **Security headers** are set in `next.config.mjs`. A strict script/style CSP
  is deferred (needs nonce wiring) and is the recommended next hardening step.
- **FX rates** in `lib/money/fx.ts` are indicative placeholders — replace with a
  live, dated rate feed before relying on cross-currency totals.

## CI

GitHub Actions runs typecheck, lint, unit tests (against a Postgres service),
and build on every push. E2E (`pnpm test:e2e`, Playwright) covers the critical
sign-up → onboarding → dashboard flow and a smoke suite.
