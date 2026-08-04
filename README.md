# Kasma

Track company bank accounts from the statements themselves. No bank API.

Upload a PDF, Excel, or CSV statement. Kasma extracts the transactions, checks
them against the statement's own running balance, and raises an alert when the
numbers don't line up.

## What it does

1. **Accounts** — balances for every company account on one dashboard.
2. **Statements** — upload PDF/Excel/CSV; transactions are extracted automatically.
3. **Transactions** — one ledger for every credit, debit, charge, and payment.
4. **Evidence** — attach receipts and notes; every change is logged.
5. **Alerts** — mismatches, missing transactions, and unusual activity.

## Tech stack

- **Next.js 16** (App Router), **React 19**, **TypeScript 5**
- **Tailwind CSS v4** + **shadcn/ui**, **next-themes** for light/dark
- **Recharts** for charts, **TanStack Table** for the ledger
- **PostgreSQL** + **Prisma**, **Auth.js** for sessions and RBAC
- **pg-boss** worker for statement parsing, S3-compatible object storage
- **Zod** for validated env and input
- LLM extraction fallback: DeepSeek for text and digital PDFs, Claude for scans

## Getting started

Prerequisites: **Node.js 20+** and **pnpm 10** (`corepack enable`).

```bash
pnpm install
cp .env.example .env      # fill in values as you enable each feature
pnpm dev                  # http://localhost:3000
```

Statement parsing runs in a separate process: `pnpm worker`.

### Scripts

| Command             | Description                      |
| ------------------- | -------------------------------- |
| `pnpm dev`          | Start the dev server (Turbopack) |
| `pnpm build`        | Production build                 |
| `pnpm start`        | Serve the production build       |
| `pnpm worker`       | Run the statement-parsing worker |
| `pnpm lint`         | ESLint (flat config)             |
| `pnpm format`       | Format with Prettier             |
| `pnpm format:check` | Check formatting                 |
| `pnpm typecheck`    | `tsc --noEmit`                   |

## Project structure

```
app/             Next.js App Router: (marketing), (auth), (app) route groups
components/      UI components (ui/ = shadcn primitives)
lib/             Domain logic: auth, db, storage, money, extraction, controls
worker/          Background worker (statement parsing)
prisma/          Database schema + migrations
tests/ e2e/      Vitest and Playwright tests
fixtures/        Sample statements for extraction tests
docs/            Architecture, user guide, deployment
```

## Documentation

- [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md) — how to use Kasma.
- [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) — production deployment and env vars.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together.
- [`fixtures/`](fixtures/) — sample statements to try the pipeline.

## License

Proprietary — all rights reserved (subject to change).
