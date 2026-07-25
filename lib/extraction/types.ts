import type { DetectedKind } from "@/lib/extraction/detect";

/** A single row as read from a source, before normalization. */
export type RawTransactionRow = {
  date?: string | null;
  valueDate?: string | null;
  description?: string | null;
  /** Signed amount, when the source has a single amount column. */
  amount?: string | number | null;
  /** Separate debit/credit columns, when present. */
  debit?: string | number | null;
  credit?: string | number | null;
  balance?: string | number | null;
  reference?: string | null;
  counterparty?: string | null;
};

/** A statement's metadata + rows as read from a source. */
export type RawStatement = {
  bankName?: string | null;
  accountLast4?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  openingBalance?: string | number | null;
  closingBalance?: string | number | null;
  currency?: string | null;
  transactions: RawTransactionRow[];
};

export type ParseInput = {
  bytes: Buffer;
  filename: string;
  contentType?: string;
  /** The account's currency, used as a hint when the statement omits it. */
  hintCurrency?: string;
};

export type ParseResult = {
  parser: string;
  /** Heuristic 0..1 confidence in the extraction. */
  confidence: number;
  raw: RawStatement;
  meta?: Record<string, unknown>;
};

export interface Parser {
  readonly name: string;
  supports(kind: DetectedKind): boolean;
  parse(input: ParseInput): Promise<ParseResult>;
}

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}
