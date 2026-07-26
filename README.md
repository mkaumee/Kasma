# Kasma

**Multi-bank financial control platform — without a bank API.**

Kasma turns a company's own bank **statements** (PDF / Excel / CSV) into a live,
verified view of cash: balances across every account, a centralized transaction
ledger, attached evidence, and automated alerts for mismatches and unusual
activity. No open-banking connection is ever required — each statement's own
running balance is used as the correctness oracle.

## The five pillars

1. **Multi-bank management** — monitor balances across all company accounts from one dashboard.
2. **Statement processing** — upload PDF/Excel statements; transactions are extracted automatically.
3. **Transaction tracking** — every credit, debit, charge, and payment in one centralized ledger.
4. **Evidence & verification** — attach receipts and notes with a complete, immutable timeline.
5. **Financial control & alerts** — detect mismatches, missing transactions, and unusual activity.

## Tech stack

- **Next.js 16** (App Router) · **React 19** · **TypeScript 5**
- **Tailwind CSS v4** + **shadcn/ui** (design system) · **next-themes** (light/dark)
- **Recharts** (charts) · **TanStack Table** (transaction ledger)
- **Zod** (validated env + input schemas)
- _Coming next:_ PostgreSQL + Prisma, Auth.js, S3-compatible storage, a pg-boss
  worker, and Claude-powered statement extraction (see the roadmap).

## Getting started

Prerequisites: **Node.js 20+** and **pnpm 10** (`corepack enable`).

```bash
pnpm install
cp .env.example .env      # fill in values as you enable each feature
pnpm dev                  # http://localhost:3000
```

### Scripts

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Start the dev server (Turbopack)         |
| `pnpm build`        | Production build                         |
| `pnpm start`        | Serve the production build               |
| `pnpm lint`         | ESLint (flat config)                     |
| `pnpm format`       | Format with Prettier                     |
| `pnpm format:check` | Check formatting                         |
| `pnpm typecheck`    | `tsc --noEmit`                           |

## Project structure

```
app/            Next.js App Router (route groups: (marketing), later (auth)/(app))
components/      UI components (ui/ = shadcn primitives)
lib/            Domain logic: auth, db, storage, money, extraction, reconciliation
worker/         Background worker (statement parsing) — added in Phase 6
prisma/         Database schema + migrations — added in Phase 1
tests/ e2e/      Unit/integration and Playwright tests
fixtures/        Sample statements for extraction tests
docs/            Architecture and the full roadmap
```

## Documentation

- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — how to use Kasma end to end.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment + env vars.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — architecture summary.
- [`docs/PLAN.md`](docs/PLAN.md) — the full phased build plan.
- [`fixtures/`](fixtures/) — sample statements to try the pipeline.

## Roadmap

The full architecture and the phased, commit-by-commit build plan live in
[`docs/PLAN.md`](docs/PLAN.md).

**Status:** All 12 phases complete — foundations, database & multi-tenancy,
auth & RBAC, the app shell, bank accounts, object storage, the statement
ingestion pipeline (parse → normalize → validate → dedupe → persist, with a
Claude fallback), statement review & confirm, the transactions ledger with
categories/rules/export, evidence & verification, reconciliation & the alerts
engine, the multi-bank dashboard, and release hardening (notifications,
security headers + rate limiting, structured logging + health checks, E2E,
and docs).

## License

Proprietary — all rights reserved (subject to change).
