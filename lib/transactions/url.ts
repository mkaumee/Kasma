/** Query-string params carried across ledger navigation (sort, filters, page). */
export type LedgerQuery = Record<string, string | undefined>;

/**
 * Merge `patch` onto the current query and render a `?a=b&c=d` string, dropping
 * empty values. Used to build sort/pagination/filter links that preserve the
 * rest of the ledger state.
 */
export function buildLedgerHref(
  base: LedgerQuery,
  patch: Record<string, string | number | undefined>,
): string {
  const sp = new URLSearchParams();
  const merged: Record<string, string | number | undefined> = {
    ...base,
    ...patch,
  };
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== "") {
      sp.set(key, String(value));
    }
  }
  const query = sp.toString();
  return query ? `?${query}` : "";
}
