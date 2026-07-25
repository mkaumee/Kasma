import { csvParser } from "@/lib/extraction/parsers/csv";
import { registerParser } from "@/lib/extraction/registry";

// Registering here (in priority order) means importing this module wires up
// all parsers. Additional parsers (xlsx, pdf, claude) are added in 6.5–6.7.
registerParser(csvParser);

export {
  parseStatement,
  selectParser,
  registeredParserNames,
} from "@/lib/extraction/registry";
