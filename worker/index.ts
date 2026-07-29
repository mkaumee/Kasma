// Load .env before anything reads process.env (Next/Prisma auto-load it, but a
// standalone worker process does not). Harmless no-op when no .env file exists.
import "dotenv/config";

import { processStatement } from "@/lib/extraction/pipeline";
import { log } from "@/lib/log";
import {
  getBoss,
  QUEUE_PARSE_STATEMENT,
  type ParseStatementJob,
} from "@/lib/queue/boss";

async function main() {
  const boss = await getBoss();
  log.info("worker started", { queue: QUEUE_PARSE_STATEMENT });

  await boss.work<ParseStatementJob>(QUEUE_PARSE_STATEMENT, async (jobs) => {
    for (const job of jobs) {
      const { statementId, organizationId } = job.data;
      log.info("processing statement", { statementId });
      try {
        const result = await processStatement(statementId, organizationId);
        log.info("statement processed", {
          statementId,
          status: result.status,
          parser: result.parser,
          confidence: Number(result.confidence.toFixed(2)),
          inserted: result.inserted,
          duplicates: result.duplicates,
          dropped: result.dropped,
          breaks: result.breaks,
          // Why nothing came out, when nothing came out. Without this the only
          // operator-visible signal was an unexplained confidence of 0.05.
          ...(result.note ? { note: result.note } : {}),
        });
      } catch (error) {
        log.error("statement processing failed", {
          statementId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error; // let pg-boss mark the job failed / retry
      }
    }
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info("worker stopping", { signal });
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  log.error("worker fatal error", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
