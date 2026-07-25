import Papa from "papaparse";

import type { DetectedKind } from "@/lib/extraction/detect";
import { extractFromRows } from "@/lib/extraction/tabular";
import type { ParseInput, ParseResult, Parser } from "@/lib/extraction/types";

export const csvParser: Parser = {
  name: "csv",

  supports(kind: DetectedKind) {
    return kind === "csv";
  },

  async parse(input: ParseInput): Promise<ParseResult> {
    const text = input.bytes.toString("utf8").replace(/^﻿/, "");
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    const rows = parsed.data.filter((row): row is string[] =>
      Array.isArray(row),
    );

    const { raw, confidence, headerIndex, columns } = extractFromRows(
      rows,
      input.hintCurrency,
    );

    return {
      parser: "csv",
      confidence,
      raw,
      meta: { headerIndex, columns },
    };
  },
};
