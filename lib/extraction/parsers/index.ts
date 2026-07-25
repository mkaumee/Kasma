import { csvParser } from "@/lib/extraction/parsers/csv";
import { pdfParser } from "@/lib/extraction/parsers/pdf";
import { xlsxParser } from "@/lib/extraction/parsers/xlsx";
import { registerParser } from "@/lib/extraction/registry";

// Registering here (in priority order) means importing this module wires up
// all deterministic parsers. The Claude extractor is NOT registered here — it
// is a special fallback the orchestrator invokes on low confidence (see
// `parseStatement` in registry.ts).
registerParser(csvParser);
registerParser(xlsxParser);
registerParser(pdfParser);

export {
  parseStatement,
  selectParser,
  registeredParserNames,
} from "@/lib/extraction/registry";
