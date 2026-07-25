import { hasEssentialColumns, mapColumns } from "@/lib/extraction/column-map";

export type TextItem = { str: string; x: number; y: number };

/** Group text items into visual lines by their y-coordinate (top to bottom). */
export function groupLines(
  items: TextItem[],
  yTolerance = 3,
): { y: number; items: TextItem[] }[] {
  const sorted = items
    .filter((i) => i.str.trim() !== "")
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; items: TextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines.find((l) => Math.abs(l.y - item.y) <= yTolerance);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((a, b) => a.x - b.x);
  return lines;
}

/**
 * Reconstruct a grid of rows from positioned text items, using the header
 * line's column x-positions as column boundaries. The first returned row is
 * the header; downstream mapping re-detects it.
 */
export function itemsToRows(items: TextItem[]): string[][] {
  const lines = groupLines(items);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const tokens = (lines[i]?.items ?? []).map((it) => it.str);
    if (hasEssentialColumns(mapColumns(tokens))) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex < 0) {
    // No header found: return each line as a single joined cell (low value).
    return lines.map((l) => [l.items.map((it) => it.str).join(" ")]);
  }

  const headerItems = lines[headerIndex]!.items;
  const columnX = headerItems.map((it) => it.x);
  const boundaries: number[] = [];
  for (let i = 1; i < columnX.length; i++) {
    boundaries.push((columnX[i - 1]! + columnX[i]!) / 2);
  }
  const columnFor = (x: number): number => {
    let idx = 0;
    while (idx < boundaries.length && x >= boundaries[idx]!) idx++;
    return idx;
  };

  const rows: string[][] = [];
  for (let i = headerIndex; i < lines.length; i++) {
    const cells: string[] = new Array(columnX.length).fill("");
    for (const it of lines[i]!.items) {
      const col = columnFor(it.x);
      cells[col] = cells[col] ? `${cells[col]} ${it.str}` : it.str;
    }
    rows.push(cells.map((c) => c.trim()));
  }
  return rows;
}
