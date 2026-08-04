# Kasma — User Guide

Kasma reads your company's bank **statements**. No bank API or open-banking
connection is needed. Each statement's printed **running balance** is what Kasma
checks the extracted rows against, which is how it catches extraction errors,
missing transactions, and unusual activity.

This guide follows the order you'll use the product in.

---

## 1. Sign in and organizations

- **Sign up** with your name, email, and a password (8+ characters), then create
  an **organization**. Every account, statement, and transaction belongs to one
  organization, and data is never shared across organizations.
- Invite teammates from **Settings › Members**. Each member has a role:

  | Role | Can do |
  |------|--------|
  | **Owner / Admin** | Everything, plus manage members, categories, rules, and view the audit log. |
  | **Accountant** | Add accounts, upload & review statements, edit/categorize/verify transactions, manage alerts. |
  | **Viewer** | Read-only access to everything. |

Switch organizations from the switcher at the top of the sidebar.

## 2. Add bank accounts

Go to **Accounts › Add account** and enter the bank, a name, the account's
**currency**, type, and **opening balance**. Only the **last 4 digits** of an
account number are ever stored — never the full number.

## 3. Upload a statement

From **Statements › Upload statement**, pick the account and the file (PDF,
Excel, or CSV). The file is stored securely and queued for extraction. You'll
see the status update live:

```
Queued → Parsing → Parsed / Needs review / Confirmed / Failed
```

Behind the scenes Kasma:
1. Detects the file type and picks a parser (CSV, Excel, or digital-PDF, with an
   LLM fallback for scanned or unusual formats).
2. Normalizes rows to canonical transactions: money as exact integer minor
   units, with an explicit credit/debit direction and type.
3. **Validates against the running balance.** Opening + Σ(amounts) must equal
   the closing balance, and each row's printed balance must be continuous.
4. Deduplicates, so re-uploading the same statement adds nothing.

## 4. Review and confirm

Open a statement to see the **original file beside the extracted rows**, with a
reconciliation banner:

- **"Balance reconciles"** — everything adds up.
- **"Doesn't reconcile — a $X gap at row N"** — a row is missing or mis-parsed.

You can **edit, add, or delete rows** inline; the banner re-checks as you type.
When it looks right, click **Confirm** to write the transactions to your ledger.
Once you've confirmed a format that reconciles cleanly, future uploads of the
**same format auto-confirm**. Use **Re-parse** to extract again, or to retry a
failed statement.

## 5. The transactions ledger

**Transactions** is one ledger across every account:

- **Filter** by account, date range, direction, type, category, verification,
  amount, evidence, or free-text search. Filters are URL-encoded — bookmark or
  **save a view**.
- **Sort** by date, amount, or description; page through results.
- **Categorize** — assign a category inline, or **bulk-categorize** everything
  matching the current filters. Define categories in **Settings › Categories**
  and automate them with **Settings › Rules** ("when description contains
  *uber* → Travel"), which run on import and on demand.
- **Export** the filtered ledger to **CSV or Excel**.

## 6. Evidence & verification

Open any transaction for its detail page:

- **Evidence** — attach receipts, invoices, or documents; preview or download
  them (access is restricted to your organization).
- **Notes** — leave comments for your team.
- **Verification** — mark a transaction **Verified**, **Disputed**, or
  **Unverified**. Bulk-verify everything matching a filter.
- **Timeline** — an immutable audit log of every change (who and when).

## 7. Alerts (financial control)

Kasma runs financial-control checks after each import and confirmation, and on
demand via **Run checks** in the **Alerts** center:

- **Balance mismatch** — a statement doesn't reconcile.
- **Missing transaction** — a gap in a statement's running balance.
- **Missing statement** — one statement's closing balance doesn't carry into
  the next's opening balance.
- **Anomaly / unusual activity** — a statistical outlier for a counterparty, a
  large round sum, or a first-seen counterparty with a large amount.

Alerts are grouped by severity. **Acknowledge**, **Resolve**, or **Dismiss**
each one; alerts auto-resolve when the underlying issue clears. Cross-account
**internal transfers** are matched automatically so cash isn't double-counted.

## 8. The dashboard

The **Dashboard** shows total cash across all accounts in your base currency,
per-account balances, cash-position and credits-vs-debits charts, open-alerts
and needs-review widgets, and a cross-account activity feed.

## 9. Notifications & activity

- The **bell** in the top bar shows in-app notifications (statement parsed,
  failed, etc.). A full list lives at **/notifications**.
- Admins can review and export the org-wide **audit log** at
  **Settings › Activity**.

---

### A note on money and currencies

All amounts are stored as exact integer **minor units**, never floats, so
figures are always precise. Cross-account totals are converted to your
organization's **base currency** using an indicative FX table. Replace it with a
live rate feed before relying on those totals financially.
