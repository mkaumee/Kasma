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
| `STORAGE_DRIVER` | prod | `s3` in production; defaults to local disk otherwise. |
| `S3_ENDPOINT` / `S3_REGION` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_BUCKET` | with S3 | Object storage credentials. |
| `ANTHROPIC_API_KEY` | optional | Enables the Claude fallback extractor for scanned/unknown statements. Without it, the deterministic CSV/Excel/PDF parsers still run. |
| `ANTHROPIC_EXTRACTION_MODEL` | optional | Defaults to a cost-efficient model. |
| `LLM_REDACT_PII` | optional | `true` (default) masks likely account numbers before sending text to the LLM. |
| `RESEND_API_KEY` | optional | Enables outbound email. Without it, notifications still land in-app; email is skipped. |
| `EMAIL_FROM` | optional | From address for outbound email. |

**Secrets never ship to the client** — only `NEXT_PUBLIC_*` values are exposed
to the browser, and `lib/env.ts` fails fast on invalid configuration.

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

## Operational notes

- **Migrations** run on deploy (`db:migrate:deploy`); never `migrate dev` in
  production.
- **The worker is stateful-ish** — it holds the pg-boss subscription. Run at
  least one instance; scale horizontally as parse volume grows.
- **Rate limiting** is in-memory (per instance). For multi-instance auth/upload
  throttling, back `lib/security/rate-limit.ts` with Redis/Upstash.
- **Logs** are structured JSON (`lib/log.ts`) — ship stdout to your aggregator.
- **Security headers** are set in `next.config.mjs`. A strict script/style CSP
  is deferred (needs nonce wiring) and is the recommended next hardening step.
- **FX rates** in `lib/money/fx.ts` are indicative placeholders — replace with a
  live, dated rate feed before relying on cross-currency totals.

## CI

GitHub Actions runs typecheck, lint, unit tests (against a Postgres service),
and build on every push. E2E (`pnpm test:e2e`, Playwright) covers the critical
sign-up → onboarding → dashboard flow and a smoke suite.
