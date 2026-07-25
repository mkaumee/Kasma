import { csvParser } from "@/lib/extraction/parsers/csv";
import { pdfParser } from "@/lib/extraction/parsers/pdf";
import { xlsxParser } from "@/lib/extraction/parsers/xlsx";
import { registerParser } from "@/lib/extraction/registry";

// Registering here (in priority order) means importing this module wires up
// all parsers. The Claude fallback is added in 6.7.
registerParser(csvParser);
registerParser(xlsxParser);
registerParser(pdfParser);

export {
  parseStatement,
  selectParser,
  registeredParserNames,
} from "@/lib/extraction/registry";
