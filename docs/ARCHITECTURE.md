# Kasma — Architecture

## Why there's no bank API

Instead of connecting to a bank (Plaid/open-banking), companies upload the
bank's own statements. Kasma parses them into normalized transactions and
checks the result against the statement's **running balance**. That check does
double duty: it tells us whether the extraction is right, and it is what finds
mismatches, missing transactions, and anomalies.

## Runtime components

| Component            | Role                                                              |
| -------------------- | ---------------------------------------------------------------- |
| **Web app**          | Next.js App Router — UI + server actions / route handlers.       |
| **PostgreSQL**       | Primary datastore via Prisma. All rows scoped by `organizationId`. |
| **Object storage**   | S3-compatible — statement files + evidence attachments.          |
| **Background worker**| pg-boss queue running the statement-parsing pipeline (async).    |
| **Extraction engine**| Pluggable parsers (CSV / XLSX / digital-PDF / LLM) + normalizer + validator. |
| **Controls engine**  | Reconciliation, dedupe, missing-transaction & anomaly detection, alerts. |
| **Auth + RBAC**      | Session auth with Organizations, Memberships, roles.             |

## The ingestion pipeline

```
Upload (PDF/XLSX/CSV) → object storage → Statement + ImportJob (queued)
  → Worker:
     1. detect type + digital-vs-scanned PDF
     2. route to parser: CSV | XLSX | digital-PDF | LLM (scanned/unknown)
     3. normalize → canonical txn (date, amount, direction, currency, ref)
     4. VALIDATE against running balance (opening + Σ signed == closing)
     5. dedupe (hash of account+date+amount+desc+ref)
     6. high confidence → parsed; low → needs_review
  → Review & Confirm UI → confirm writes the transactions to the ledger
```

## Data model (high level)

- **Tenant:** `Organization`, `User`, `Membership(role)`
- **Banking:** `BankAccount`, `Statement`, `ImportJob`
- **Ledger:** `Transaction`, `Category`, `Rule`
- **Evidence:** `Attachment`, `Note`, `TransactionEvent` (immutable timeline)
- **Controls:** `Reconciliation`, `Alert`

Money is stored as integer **minor units** + ISO currency code (never floats).

## Frontend architecture

- **Next.js App Router** with route groups: `(marketing)` (public), `(auth)`
  (sign-in/up), `(app)` (authenticated shell).
- **Design system:** Tailwind v4 tokens (light/dark, financial semantic colors)
  + shadcn/ui primitives. Charts use **Recharts**; the transaction ledger uses
  **TanStack Table**.

## Conventions

- **Server/worker shared code** avoids `server-only` so the standalone worker
  can import it (see `lib/env.ts`).
- **Validated boundaries:** environment and external input are parsed with Zod.
- **Tenant isolation:** every query is scoped by `organizationId`, enforced in a
  single query layer with automated cross-tenant tests.
