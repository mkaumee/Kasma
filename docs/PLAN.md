# Kasma — Multi-Bank Financial Control Platform (no bank API)

## Context

Kasma is a new startup product (empty repo, fresh git branch `claude/kasma-multibank-architecture-jh47pz`). The goal is a multi-tenant SaaS where companies **monitor balances across all their bank accounts, process bank statements, track every transaction, attach evidence, and catch financial errors — without ever connecting to a bank API** (no Plaid/Yodlee/TrueLayer/open-banking).

The central question — *"how is this possible without a bank API?"* — has a clear answer: **Kasma is statement-upload-centric.** Instead of pulling data from the bank, the company (or its accountant) uploads the bank's own PDF/Excel/CSV statements. Kasma parses them into normalized transactions and uses the **statement's own running balance as ground truth** to validate the extraction and detect mismatches, missing transactions, and anomalies. This is exactly how offline reconciliation has always worked — we just automate the parsing and the checks.

This file is the **master roadmap**. The project is large, so it is broken into 13 phases and ~76 commits to be built **one phase at a time, one commit at a time** after approval — not all at once.

---

## Decisions (defaults — adjustable at approval)

I proposed clarifying questions; they were declined in favor of proceeding, so these are my recommended startup defaults. Any can be overridden before/at approval:

| Decision | Default chosen | Why |
|---|---|---|
| **Form factor** | **Web app, prototype-first** — ✅ confirmed by user | Ship a working web prototype before anything else (no mobile/native for now). |
| **Stack** | TypeScript full-stack: **Next.js (App Router) + PostgreSQL + Prisma + Node worker** — ✅ confirmed by user | One language end-to-end, fastest startup velocity, single deploy. Claude does the hard parsing, so we don't need Python's PDF ecosystem. |
| **UI design system** | **shadcn/ui (base) + Recharts charts (Tremor-style) + TanStack Table (ledger)** — all MIT open source | Cohesive Radix + Tailwind v4 foundation, own-your-code. Tremor's charts are Recharts-based; we compose them directly since the legacy `@tremor/react` package targets Tailwind v3. See **UI Design System** section. |
| **Extraction** | **Hybrid**: deterministic parsers (CSV/XLSX/digital-PDF) first, **Claude** fallback for scanned/unknown formats, every result validated against the running balance | Best accuracy + broadest bank coverage without per-bank templates. |
| **Market** | **Multi-currency, global-ready** data model from day 1 | LLM extraction is format-agnostic; avoids painful currency retrofits. |
| **Scope** | **Multi-tenant SaaS from day 1** (Organizations, roles, tenant isolation) | "Company bank accounts" + "startup" implies real multi-tenancy; retrofitting it later is costly. |
| **Infra minimalism** | Job queue on **pg-boss (Postgres)**, storage via **S3-compatible** abstraction (local/MinIO in dev) | Keep infra to just Postgres + object storage for the MVP; Redis/BullMQ is a drop-in later. |

---

## UI Design System (open source)

One cohesive system on a single **Radix + Tailwind** foundation — nothing proprietary, everything MIT:
- **shadcn/ui** — base primitives (Button, Input, Form, Dialog, Tabs, DropdownMenu, Toast, Sheet, Command). Copy-paste source into the repo → we own and theme it, no lock-in.
- **Tremor** — dashboard blocks: KPI/stat cards, area/bar/line/donut charts, tracker & delta badges. Purpose-built for financial dashboards, Vercel-backed, MIT core, Radix+Tailwind+Recharts under the hood.
- **TanStack Table** — headless engine for the transaction ledger (sort/filter/paginate/virtualize thousands of rows), styled with shadcn's table.
- **Recharts** — custom charts beyond Tremor; follow the `dataviz` skill for palette + accessibility.
- **lucide-react** icons · **Tailwind design tokens** for light/dark theming · **next-themes** for theme switching.

**Design language**: clean, dense-but-legible financial UI — neutral slate/zinc base, a single brand accent, semantic colors for money (credits positive / debits negative / alerts by severity), tabular-nums for figures, generous tables, card-based dashboard. Accessibility (Radix a11y + WCAG contrast) is baked in.

**Implementation note (Phase 0):** on **Tailwind v4**, the legacy `@tremor/react` npm package (Tailwind v3) is incompatible. Since Tremor's charts are built on **Recharts** anyway, Kasma composes Tremor-style dashboard blocks (KPI cards, area/bar/line/donut) directly on Recharts + shadcn primitives — same look, no v3 coupling.

**Alternatives (if a batteries-included single library is preferred later)**: **Mantine** (120+ components incl. DataTable — popular in fintech) or **Ant Design** (enterprise finance look, strongest out-of-the-box tables/forms). Recommendation stands with shadcn/ui + Recharts for speed + ownership.

---

## Architecture Overview

**Components**
1. **Web app** — Next.js App Router (UI + server actions/route handlers).
2. **PostgreSQL** — primary datastore via Prisma ORM.
3. **Object storage** — statement files + evidence (S3-compatible abstraction; MinIO/local in dev).
4. **Background worker** — pg-boss queue running the statement-parsing pipeline (async, LLM calls).
5. **Extraction engine** — pluggable parsers (CSV, XLSX, digital-PDF, Claude) + normalizer + validator.
6. **Controls engine** — reconciliation, dedupe, missing-transaction & anomaly detection, alerts.
7. **Auth + RBAC** — session auth with Organizations, Memberships, roles.
8. **Notifications** — email (Resend/SES) + in-app alerts.

**Data model (Prisma)** — tenant: `Organization`, `User`, `Membership(role)`; banking: `BankAccount`, `Statement`, `ImportJob`; ledger: `Transaction`, `Category`, `Rule`; evidence: `Attachment`, `Note`, `TransactionEvent` (immutable timeline/audit); controls: `Reconciliation`, `Alert`. All rows are tenant-scoped by `organizationId` with an enforced isolation layer.

### The "no bank API" pipeline (heart of the product)
```
Upload (PDF/XLSX/CSV) → object storage → Statement + ImportJob (queued)
  → Worker:
     1. detect type + digital-vs-scanned PDF
     2. route to parser: CSV | XLSX | digital-PDF | Claude (scanned/unknown/low-confidence)
     3. normalize → canonical txn (date, amount, direction, currency, ref, counterparty)
     4. VALIDATE against running balance: opening + Σ(signed) == closing; each row balance continuous
     5. dedupe (hash of account+date+amount+desc+ref), within-batch & cross-statement
     6. confidence high → parsed/auto-confirm; low → needs_review
  → Review & Confirm UI (original file side-by-side with extracted rows, inline edit)
  → Confirm → transactions become source of truth; save bank template/mapping for reuse
```
The **running balance is the correctness oracle** — it lets Kasma detect a hallucinated/mis-parsed row, a missing transaction (balance jumps by an unexplained amount), and inter-statement gaps (statement N's closing ≠ N+1's opening).

### Financial control (Feature 5) built on that oracle
Balance reconciliation, missing-transaction detection (intra- and inter-statement), cross-account internal-transfer matching (fuzzy amount/date), duplicate detection, and anomaly detection (statistical outliers + rules: new counterparty, large round sums, off-hours, unusual frequency) → deduplicated **Alerts** with severity and an open/ack/resolve workflow.

---

## Phased Roadmap (~76 commits)

Built strictly in order; each commit is independently reviewable and leaves the app in a working state. Tests are added alongside the code they cover.

### Phase 0 — Foundations & tooling
1. Init Next.js + TypeScript, package.json, tsconfig, folder structure
2. ESLint + Prettier + editorconfig + .gitignore
3. Tailwind + design tokens + `next-themes` (light/dark) + financial color semantics
4. Design system: shadcn/ui primitives + Tremor (cards/charts) + TanStack Table wiring
5. Typed env config (zod) + `.env.example`
6. App shell/layout + routing skeleton + landing placeholder
7. GitHub Actions CI (typecheck/lint/test/build) + SessionStart hook
8. README + `ARCHITECTURE.md` + `docs/` skeleton

### Phase 1 — Database & data model
9. Prisma + Postgres + `docker-compose` for local DB
10. Tenant schema: Organization, User, Membership (+ migration)
11. Banking schema: BankAccount, Statement, ImportJob (+ migration)
12. Ledger schema: Transaction, Category (+ migration)
13. Evidence schema: Attachment, Note, TransactionEvent (+ migration)
14. Controls schema: Reconciliation, Alert, Rule (+ migration)
15. Prisma client wrapper + seed script + DB test helpers

### Phase 2 — Auth & multi-tenancy
16. Auth (Auth.js or Lucia) — email/password + sessions
17. Sign up / sign in / sign out flows
18. Organization creation + tenant context/middleware
19. RBAC (owner/admin/accountant/viewer) + permission guards
20. Team invites + accept-invite flow
21. Tenant data-isolation layer (scoped queries) + isolation tests

### Phase 3 — App shell & navigation
22. Authenticated layout, sidebar, org switcher, user menu
23. Settings area (org profile, members, roles)
24. Empty/loading/error states + toasts

### Phase 4 — Bank accounts (Feature 1 foundation)
25. BankAccount CRUD (server actions) + validation
26. Add/edit account UI (bank, masked number, currency, type, opening balance)
27. Accounts list + account detail skeleton
28. Multi-currency support + FX-rate table/util

### Phase 5 — Object storage & uploads
29. Storage abstraction (S3-compatible; MinIO/local) + signed URLs
30. Secure upload endpoint (size/type validation, tenant-scoped keys, scan hook stub)
31. File download/preview with access control

### Phase 6 — Statement ingestion pipeline (Feature 2, core)
32. pg-boss queue + worker process + graceful shutdown
33. Statement upload UI (drag-drop, per-account, period) → create Statement + enqueue
34. Parser interface + registry + type/MIME + digital-vs-scanned detection
35. CSV parser + column-mapping heuristics
36. XLSX parser (sheet/table detection)
37. Digital-PDF text/table parser
38. Claude extractor (Anthropic SDK) → structured JSON, schema + prompt + retries (fallback)
39. Normalizer → canonical transaction shape + sign/direction inference
40. Validation engine: running-balance continuity + confidence scoring
41. Dedupe: dedupeHash, within-batch + cross-statement flagging
42. Persist transactions transactionally + status transitions + audit events
43. Saved per-bank template reuse + confidence-based auto-confirm vs needs_review

### Phase 7 — Statement review & confirm UI (Feature 2)
44. Statement list + status badges + job progress
45. Review UI: original file preview side-by-side with extracted rows
46. Inline edit/add/delete rows, fix mapping, re-validate
47. Confirm statement (commit txns) + re-parse + failure handling

### Phase 8 — Transaction tracking (Feature 3)
48. Ledger table (server pagination + sorting)
49. Filters (account/date/direction/type/category/verification/amount/search) + saved views
50. Transaction detail skeleton
51. Categories CRUD + manual + bulk categorize
52. Auto-categorization rules engine
53. Type classification (credit/debit/charge/fee/payment) + counterparty extraction
54. Export filtered transactions (CSV/Excel)

### Phase 9 — Evidence & verification (Feature 4)
55. Attach evidence to transaction + list/preview/delete
56. Notes/comments on transactions
57. Verification workflow (unverified/verified/disputed) + who/when
58. Transaction timeline UI from TransactionEvent audit log
59. Bulk verify / evidence-completeness indicators

### Phase 10 — Reconciliation & financial control (Feature 5)
60. Reconciliation engine: per-statement balance reconciliation + results model
61. Missing-transaction detection (intra-balance gaps + inter-statement period gaps)
62. Cross-account internal-transfer matching (fuzzy amount/date)
63. Anomaly detection (statistical outliers + rules)
64. Alert generation/dedupe/severity + open/ack/resolve
65. Alerts center UI + per-alert drill-down + resolution actions

### Phase 11 — Multi-bank dashboard (Feature 1, full)
66. Dashboard: aggregated base-currency balances + per-account cards
67. Cash-position + credits/debits trend charts (dataviz)
68. Alerts & needs-review summary widgets + quick actions
69. Cross-account recent-activity feed

### Phase 12 — Notifications, hardening, polish
70. Email notifications (alert digests, invites, statement-parsed)
71. In-app notifications center
72. Org-level audit-log viewer + activity export
73. Security hardening (rate limiting, headers, validation, RBAC audit)
74. Structured logging + health checks + error monitoring
75. Playwright E2E for critical flows + demo seed data
76. Docs: user guide, deployment guide, sample statements/test fixtures

---

## Verification

- **Per phase**: `pnpm typecheck && pnpm lint && pnpm test` green; feature exercised in the running app (`pnpm dev`) and, where relevant, in the worker.
- **Pipeline (Phase 6–7)**: end-to-end fixture test — a sample CSV, a digital-PDF, and a scanned-PDF statement each ingest to correct transactions; balance-validation catches an intentionally corrupted row; dedupe rejects a re-upload.
- **Controls (Phase 10)**: fixtures that deliberately drop a transaction / duplicate one / include an outlier each raise the expected Alert; internal transfer between two seeded accounts auto-matches.
- **Multi-tenancy (Phase 2)**: automated test proves org A cannot read org B's accounts/statements/transactions.
- **End of build**: Playwright E2E covering sign-up → create org → add account → upload statement → review/confirm → attach evidence → resolve an alert; deployed to a staging environment.

## Execution notes
- Each phase is a small PR-sized batch; commits within a phase are pushed to `claude/kasma-multibank-architecture-jh47pz`.
- After approval, work starts at **Phase 0, commit 1** and proceeds sequentially. I will pause for review at phase boundaries rather than doing everything in one go.

---

# Appendices (execution detail)

## Appendix A — Repository structure
Single Next.js app + a worker entry (no monorepo tooling to start — add Turborepo only if we split services later).
```
kasma/
  app/
    (marketing)/            # public landing
    (auth)/                 # sign-in / sign-up / accept-invite
    (app)/                  # authenticated shell
      dashboard/  accounts/  statements/  transactions/  alerts/  settings/
    api/                    # route handlers (uploads, webhooks, health)
  components/  (ui/ = shadcn primitives; feature components alongside)
  lib/
    auth/                   # session + rbac helpers
    db/                     # prisma client + tenant-scoped query layer
    storage/                # S3-compatible abstraction + signed URLs
    money/                  # currency + FX conversion
    extraction/
      parsers/              # csv.ts xlsx.ts pdf.ts claude.ts + registry.ts
      normalize.ts  validate.ts  dedupe.ts  confidence.ts
    reconciliation/         # balance.ts missing.ts transfers.ts anomaly.ts alerts.ts
  worker/                   # pg-boss entry + job handlers (parse-statement, run-controls)
  prisma/                   # schema.prisma + migrations/ + seed.ts
  tests/                    # vitest unit + integration
  e2e/                      # playwright
  fixtures/                 # sample statements (csv/pdf/scanned) for tests
  docs/                     # ARCHITECTURE.md, user + deploy guides
```

## Appendix B — Data model detail (key fields & enums)
- **Enums**: `Role {OWNER, ADMIN, ACCOUNTANT, VIEWER}`; `StatementStatus {UPLOADED, QUEUED, PARSING, PARSED, NEEDS_REVIEW, CONFIRMED, FAILED}`; `TxnDirection {CREDIT, DEBIT}`; `TxnType {CREDIT, DEBIT, CHARGE, FEE, PAYMENT, TRANSFER}`; `VerificationStatus {UNVERIFIED, VERIFIED, DISPUTED}`; `AlertType {BALANCE_MISMATCH, MISSING_TRANSACTION, MISSING_STATEMENT, DUPLICATE, ANOMALY, UNUSUAL_ACTIVITY}`; `AlertStatus {OPEN, ACKNOWLEDGED, RESOLVED, DISMISSED}`; `AttachmentKind {RECEIPT, INVOICE, DOCUMENT, NOTE}`.
- **Money**: store as integer **minor units** + ISO currency code (never floats). FX rate captured at conversion time.
- **BankAccount**: organizationId, bankName, accountName, last4, currency, type, openingBalance, isActive.
- **Statement**: bankAccountId, periodStart/End, openingBalance, closingBalance, currency, fileRef, status, source (`UPLOAD`), parserUsed, confidence, rawModelResponseRef (for LLM audit).
- **Transaction**: organizationId, bankAccountId, statementId, date, valueDate?, description, rawDescription, amount(minor, signed), direction, type, runningBalance?, currency, counterparty?, reference?, categoryId?, verificationStatus, dedupeHash (unique per org), isDuplicate, isInternalTransfer, matchedTransferId?.
- **TransactionEvent** (immutable timeline): transactionId, actorId?, kind (`CREATED|EDITED|CATEGORIZED|EVIDENCE_ADDED|VERIFIED|MATCHED|NOTE`), payload(json), createdAt.
- **Reconciliation**: statementId, expectedClosing, computedClosing, delta, status, unmatchedCount.
- **Alert**: organizationId, type, severity, status, subjectRef (account/statement/txn), dedupeKey (unique), detail(json), createdAt, resolvedBy/At.

## Appendix C — Tech stack specifics
**Next.js 16** / React 19 / **TypeScript 5** (pinned — Next 16's build-time type integration doesn't support the TS 7 native compiler yet) / **ESLint 9** (pinned — ESLint 10 removed `context.getFilename()`, which eslint-plugin-react still uses) · **pnpm** · **Tailwind v4** + **shadcn/ui** + lucide · Prisma + PostgreSQL · **Auth.js (NextAuth v5)** credentials + Prisma adapter · **zod v4** validation · **Recharts** + **TanStack Table** (follow `dataviz` skill) · **pg-boss** queue · **@aws-sdk/client-s3** (MinIO-compatible) · **@anthropic-ai/sdk** · PDF: `pdfjs-dist` (text + render pages to images for vision) · XLSX: `xlsx`/`exceljs`; CSV: `papaparse` · email: **Resend** · tests: **Vitest** + **Playwright**.
> Extraction model choice: use a cost-efficient Claude model (e.g. Sonnet) for statement extraction with **tool-use/structured output**; reserve the top model for hard/low-confidence pages. Metered per org.

## Appendix D — Claude extraction contract (the "no bank API" guardrails)
- **Input**: digital PDF → extracted text + page layout; scanned PDF/image → render pages via `pdfjs-dist` and send as images (vision). Chunk by page for large statements, stitching running balances across chunks.
- **Output**: forced JSON via tool-use — `{ statement: {bankName, last4, periodStart, periodEnd, openingBalance, closingBalance, currency}, transactions: [{date, valueDate?, description, amount, direction, balance?, reference?}] }`. `temperature: 0`.
- **We never trust model math**: totals/closing are **recomputed by us** and cross-checked against the model-reported balances (Appendix E). If validation fails, one correction retry with the specific broken row; else route to `NEEDS_REVIEW`.
- **Only invoked on fallback** (deterministic parser failed or low confidence). Cache extraction by file SHA-256. Store raw prompt+response (`rawModelResponseRef`) → gives the audit trail LLM tools usually lack.
- **PII**: option to redact/mask account numbers before sending to the LLM.

## Appendix E — Reconciliation & anomaly algorithms
- **Balance continuity**: sort rows chronologically; assert `prevBalance + signedAmount == currBalance` within a currency epsilon; row 0 vs statement opening; last row vs closing.
- **Missing transaction**: when a row fails continuity, `impliedMissing = currBalance - (prevBalance + signedAmount)` → `MISSING_TRANSACTION` alert carrying the gap and location.
- **Missing statement**: `statement[n].closing != statement[n+1].opening` for an account → `MISSING_STATEMENT`.
- **Dedupe**: `sha256(accountId | isoDate | signedMinorAmount | normalizedDesc | reference)`; unique per org; within-batch + cross-statement.
- **Internal transfer match**: pair rows across the org's own accounts where `amountA == -amountB`, `|dateA - dateB| <= N days`, opposite direction (+ description similarity bonus); flag `isInternalTransfer` so cash-position isn't double-counted.
- **Anomaly**: rolling mean/stddev per counterparty & category → z-score outliers; rule flags — first-seen counterparty, large round sums, off-hours/weekend value dates, velocity spikes vs baseline. Optional Claude-written plain-English explanation per alert.
- **Alert dedupe**: unique `dedupeKey = (org, type, subjectRef, periodBucket)` prevents re-alerting.

## Appendix F — Security, privacy & compliance (financial data)
Encryption at rest (DB + object storage) and TLS in transit · tenant isolation enforced in one query layer (`organizationId` on every read/write) with automated cross-tenant tests, Postgres RLS as a later hardening · Anthropic key + all secrets server-side only, never committed · account-number masking (store last 4), optional LLM-input redaction · immutable audit log (who/when on every change) · org-delete purges files + rows (retention/right-to-delete) · least-privilege RBAC (viewers read-only) · rate limiting on auth/uploads, file type/size caps, malware-scan hook. Kasma moves **no funds** — it only reads statements — which keeps the regulatory surface small, but statements are treated as sensitive records throughout.

## Appendix G — Local dev & deployment
- **Dev**: `docker-compose` (Postgres + MinIO); `pnpm dev` (web) + `pnpm worker` (pg-boss). Seeded demo org + fixture statements.
- **Env**: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `S3_*`, `AUTH_SECRET`, `RESEND_API_KEY`.
- **Deploy (suggested)**: web on Vercel; managed Postgres (Neon/Supabase/RDS); S3 bucket; the pg-boss **worker on a persistent host** (Railway/Fly/ECS) — not Vercel serverless, since parsing jobs are long-running. Migrations run on deploy; CI runs typecheck/lint/test on every PR.

## Appendix H — UI/UX screen specifications (wireframe-level)

**Design tokens**: zinc/slate neutrals · **indigo** primary accent · semantic money colors — **emerald** = credit/positive, **rose** = debit/negative, **amber** = warning, **red** = critical alert · `tabular-nums` + right-aligned amounts · comfortable density · rounded-xl cards · light/dark via `next-themes`. Every screen is responsive (sidebar collapses to a drawer on mobile).

**App shell** — left sidebar: org switcher (top) → nav (Dashboard, Accounts, Statements, Transactions, Alerts, Settings) → user menu (bottom). Top bar: page title, global command search (`⌘K`, shadcn Command), notifications bell, theme toggle, primary **"Upload statement"** button.

1. **Auth** (sign in / sign up / accept-invite) — centered shadcn `Card` + `Form`, Kasma wordmark, minimal.
2. **Dashboard** (Feature 1) — row of Tremor KPI cards: *Total cash* (base currency, all accounts), *Accounts*, *Open alerts*, *Needs review*. Below: per-account balance cards grid (bank name, masked no., currency, balance, delta badge). Tremor `AreaChart` cash-position over time; `BarChart` credits vs debits. Right rail: open-alerts list + cross-account activity feed.
3. **Accounts** (Feature 1) — card/table list (bank, last4, currency, current balance, last statement date, status). "Add account" `Dialog`. Account detail: balance header + sparkline, tabs → *Transactions | Statements | Reconciliation*.
4. **Statements** (Feature 2) — list with status badges (Uploaded/Parsing/Needs review/Confirmed/Failed) + live parse-progress. Upload: drag-drop dropzone → pick account → period auto-detected/editable → enqueue.
5. **Statement review & confirm** (Feature 2) — **split view**: left = original file preview (PDF/image/sheet); right = extracted rows in an editable **TanStack Table** with a validation banner ("Balance reconciles ✓" or "Mismatch: 1,240.00 gap at rows 14–15"). Inline-edit cells, add/delete rows, low-confidence cells highlighted, **Confirm** commits transactions; **Re-parse** / failure states handled.
6. **Transactions ledger** (Feature 3) — dense TanStack Table: date · account · description · counterparty · category · amount (colored by direction) · running balance · verification · evidence icon. Filter bar (account, date range, direction, type, category, amount range, verification, search) + **saved views**. Bulk-action toolbar; row opens a detail `Sheet`.
7. **Transaction detail** (Features 3+4) — `Sheet`/page: amount + meta header, verification control (Unverified/Verified/Disputed), **evidence** grid + upload (receipts/invoices/docs), notes/comments, **timeline** (vertical stepper from `TransactionEvent` audit log), category & counterparty edit, links to source statement + matched transfer.
8. **Alerts center** (Feature 5) — list grouped by severity/type with status filters; each card: type, linked subject (account/statement/txn), plain-English detail (e.g. "Duplicate of txn #8421"), actions (Investigate → drill-down, Acknowledge, Resolve, Dismiss).
9. **Settings** — org profile · members table (roles + invite) · categories & auto-rules · notification preferences · API keys/usage (extraction metering).
