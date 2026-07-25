import { csvParser } from "@/lib/extraction/parsers/csv";
import { xlsxParser } from "@/lib/extraction/parsers/xlsx";
import { registerParser } from "@/lib/extraction/registry";

// Registering here (in priority order) means importing this module wires up
// all parsers. Additional parsers (pdf, claude) are added in 6.6–6.7.
registerParser(csvParser);
registerParser(xlsxParser);

export {
  parseStatement,
  selectParser,
  registeredParserNames,
} from "@/lib/extraction/registry";
