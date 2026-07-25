import { createHash } from "node:crypto";

/**
 * Dedupe — prevents the same transaction from being counted twice, whether a
 * statement is re-uploaded (cross-statement) or a row is repeated within one
 * batch. The key is deterministic so a re-upload of an identical statement
 * produces identical hashes, which collide with the per-org unique index
 * `@@unique([organizationId, dedupeHash])` on Transaction.
 *
 * Hash formula (mirrors the schema doc-comment):
 *   sha256(account | isoDate | signedMinorAmount | normalizedDesc | reference)
 */

export type DedupeKeyInput = {
  /** Bank account id — dedupe is scoped to a single account. */
  bankAccountId: string;
  date: Date;
  /** Signed amount in minor units. */
  amount: bigint;
  description: string;
  reference?: string | null;
};

/** Normalize free text so trivial punctuation/spacing differences still match. */
function normalizeForHash(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Compute the deterministic per-account dedupe hash for a transaction. */
export function dedupeHash(input: DedupeKeyInput): string {
  const isoDate = input.date.toISOString().slice(0, 10);
  const key = [
    input.bankAccountId,
    isoDate,
    input.amount.toString(),
    normalizeForHash(input.description),
    normalizeForHash(input.reference ?? ""),
  ].join("|");
  return createHash("sha256").update(key).digest("hex");
}

export type DuplicateReason = "batch" | "existing";

export type DedupeFlag = {
  hash: string;
  isDuplicate: boolean;
  /** Why it's a duplicate: earlier in this batch, or already persisted. */
  reason: DuplicateReason | null;
};

/**
 * Flag duplicates across a batch of hashes. A hash already present in
 * `existing` (previously persisted for the org) is an "existing" duplicate;
 * a hash repeated within the batch is a "batch" duplicate after its first
 * occurrence. The first, non-duplicate occurrence is the one to persist.
 */
export function flagDuplicates(
  hashes: string[],
  existing: ReadonlySet<string> = new Set(),
): DedupeFlag[] {
  const seen = new Set<string>();
  return hashes.map((hash) => {
    if (existing.has(hash)) {
      return { hash, isDuplicate: true, reason: "existing" };
    }
    if (seen.has(hash)) {
      return { hash, isDuplicate: true, reason: "batch" };
    }
    seen.add(hash);
    return { hash, isDuplicate: false, reason: null };
  });
}
