import type { NormalizedStatement } from "@/lib/extraction/normalize";

/**
 * Checks extracted rows against the statement's own running balance, which is
 * the only thing we have to check them against. We recompute the balance from
 * the (signed, minor-unit) amounts and assert:
 *   - opening + Σ(amounts) == stated closing, and
 *   - each row's printed balance continues from the previous one.
 * A break localizes a mis-parsed row or a genuinely missing transaction (the
 * gap is what the balance says is unaccounted for). The result also produces a
 * validation-adjusted confidence that routes the statement to auto-confirm or
 * needs-review.
 */

export type ContinuityBreak = {
  /** Index into the statement's transactions where continuity broke. */
  index: number;
  /** Balance we computed: previous balance + this row's amount. */
  expectedBalance: bigint;
  /** Balance printed on this row. */
  actualBalance: bigint;
  /** actual − expected: the unexplained gap (implied missing amount). */
  gap: bigint;
};

export type ValidationResult = {
  /** True when everything we could check reconciled exactly. */
  ok: boolean;
  sumAmounts: bigint;
  /** opening + Σ(amounts), when the opening balance is known. */
  computedClosing: bigint | null;
  statedClosing: bigint | null;
  /** computedClosing − statedClosing, when both are known. */
  closingDelta: bigint | null;
  /** Whether the recomputed closing matches the stated one (null if unknown). */
  closingOk: boolean | null;
  /** How many rows carried a printed balance. */
  balanceCount: number;
  /** Whether there were enough balances to check row continuity. */
  hasBalances: boolean;
  breaks: ContinuityBreak[];
  /** Parser confidence adjusted by what validation could prove. */
  confidence: number;
};

export type ValidateOptions = {
  /** Confidence reported by the parser/extractor for this statement. */
  parserConfidence: number;
  /** Allowed absolute difference in minor units (default exact). */
  toleranceMinor?: bigint;
};

function abs(v: bigint): bigint {
  return v < 0n ? -v : v;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Highest confidence achievable without an independent balance to verify. */
const UNVERIFIABLE_CAP = 0.85;
/** Confidence when the statement fully reconciles against its balances. */
const RECONCILED_CONFIDENCE = 0.98;

function scoreConfidence(
  parserConfidence: number,
  result: Omit<ValidationResult, "confidence" | "ok">,
): { confidence: number; ok: boolean } {
  const openCloseKnown = result.closingOk !== null;
  const continuityKnown = result.hasBalances;

  // Nothing to validate against: trust the parser, but cap it.
  if (!openCloseKnown && !continuityKnown) {
    return {
      confidence: clamp(parserConfidence, 0.05, UNVERIFIABLE_CAP),
      ok: false,
    };
  }

  const closingPassed = result.closingOk !== false; // true or unknown
  const continuityPassed = !continuityKnown || result.breaks.length === 0;

  if (closingPassed && continuityPassed && (openCloseKnown || continuityKnown)) {
    // Fully reconciled against real balances.
    return { confidence: RECONCILED_CONFIDENCE, ok: true };
  }

  // Something failed: penalize proportionally.
  let score = parserConfidence;
  if (result.closingOk === false) score = Math.min(score, 0.45);
  if (continuityKnown && result.breaks.length > 0) {
    const ratio = result.breaks.length / Math.max(result.balanceCount, 1);
    score = Math.min(score, 0.6 * (1 - Math.min(ratio, 1)));
  }
  return { confidence: clamp(score, 0.05, UNVERIFIABLE_CAP), ok: false };
}

/** The only fields the balance math needs from a transaction. */
export type BalanceRow = { amount: bigint; balance: bigint | null };

export type BalanceInput = {
  openingBalance: bigint | null;
  closingBalance: bigint | null;
  rows: BalanceRow[];
  /**
   * Whether each balance was derived from the rows rather than read off the
   * statement (see NormalizedStatement). When BOTH are derived the closing
   * identity `opening + Σamounts == closing` holds by construction, so it
   * proves nothing and is skipped — otherwise a statement nobody verified
   * would report as fully reconciled.
   */
  openingBalanceInferred?: boolean;
  closingBalanceInferred?: boolean;
};

/**
 * Core running-balance validation over a minimal row shape. Pure and free of
 * any server dependency, so the review editor can re-run it in the browser for
 * live feedback as rows are edited.
 */
export function validateBalances(
  input: BalanceInput,
  opts: ValidateOptions,
): ValidationResult {
  const tolerance = opts.toleranceMinor ?? 0n;
  const { rows } = input;

  const sumAmounts = rows.reduce((acc, r) => acc + r.amount, 0n);

  const opening = input.openingBalance;
  const statedClosing = input.closingBalance;
  const computedClosing = opening != null ? opening + sumAmounts : null;

  // Both sides derived from the rows ⇒ the identity is circular; it would pass
  // for any set of rows whose continuity holds, so it is not evidence.
  const circular =
    input.openingBalanceInferred === true &&
    input.closingBalanceInferred === true;

  const closingDelta =
    !circular && computedClosing != null && statedClosing != null
      ? computedClosing - statedClosing
      : null;
  const closingOk =
    closingDelta != null ? abs(closingDelta) <= tolerance : null;

  // Row-by-row continuity, in printed order (same-day order is meaningful).
  const balanceCount = rows.filter((r) => r.balance != null).length;
  const hasBalances = balanceCount >= 2;
  const breaks: ContinuityBreak[] = [];

  let running: bigint | null = opening;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (running == null) {
      // No anchor yet: adopt this row's balance and continue from it.
      if (row.balance != null) running = row.balance;
      continue;
    }
    running += row.amount;
    if (row.balance != null) {
      if (abs(running - row.balance) > tolerance) {
        breaks.push({
          index: i,
          expectedBalance: running,
          actualBalance: row.balance,
          gap: row.balance - running,
        });
        running = row.balance; // resync so each break is isolated
      }
    }
  }

  const partial: Omit<ValidationResult, "confidence" | "ok"> = {
    sumAmounts,
    computedClosing,
    statedClosing,
    closingDelta,
    closingOk,
    balanceCount,
    hasBalances,
    breaks,
  };

  const { confidence, ok } = scoreConfidence(opts.parserConfidence, partial);
  return { ...partial, confidence, ok };
}

/**
 * Validate a normalized statement against its running balance.
 * Comparisons are exact in minor units unless a tolerance is given.
 */
export function validateStatement(
  statement: NormalizedStatement,
  opts: ValidateOptions,
): ValidationResult {
  return validateBalances(
    {
      openingBalance: statement.openingBalance,
      closingBalance: statement.closingBalance,
      openingBalanceInferred: statement.openingBalanceInferred,
      closingBalanceInferred: statement.closingBalanceInferred,
      rows: statement.transactions.map((t) => ({
        amount: t.amount,
        balance: t.balance,
      })),
    },
    opts,
  );
}
