import type { StatementStatus } from "@prisma/client";

export const STATEMENT_STATUS_LABEL: Record<StatementStatus, string> = {
  UPLOADED: "Uploaded",
  QUEUED: "Queued",
  PARSING: "Parsing",
  PARSED: "Parsed",
  NEEDS_REVIEW: "Needs review",
  CONFIRMED: "Confirmed",
  FAILED: "Failed",
};

export type BadgeVariant =
  "default" | "secondary" | "warning" | "success" | "destructive";

export function statementStatusVariant(status: StatementStatus): BadgeVariant {
  switch (status) {
    case "CONFIRMED":
      return "success";
    case "PARSED":
      return "default";
    case "NEEDS_REVIEW":
      return "warning";
    case "FAILED":
      return "destructive";
    default:
      return "secondary";
  }
}

/** Statements whose parse is still in flight. */
export function isStatementProcessing(status: StatementStatus): boolean {
  return status === "QUEUED" || status === "PARSING" || status === "UPLOADED";
}
