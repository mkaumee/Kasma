# Sample statements

Sample bank-statement files for trying the ingestion pipeline. Upload them from
**Statements › Upload statement** against a USD account with a **$1,000.00
opening balance**.

| File | What it demonstrates |
|------|----------------------|
| `sample-clean.csv` | A statement whose running balance reconciles → **Parsed**, ready to confirm. |
| `sample-gap.csv` | A broken running balance (a transaction is missing) → **Needs review**, plus a **Missing transaction** alert. |
| `sample-separate-columns.csv` | Separate debit/credit columns instead of one signed amount. |

These are also useful as manual QA fixtures. Automated tests build their own
in-memory fixtures under `tests/`.
