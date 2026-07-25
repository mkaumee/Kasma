// Load .env before anything reads process.env (Next/Prisma auto-load it, but a
// standalone worker process does not). Harmless no-op when no .env file exists.
import "dotenv/config";

import {
  getBoss,
  QUEUE_PARSE_STATEMENT,
  type ParseStatementJob,
} from "@/lib/queue/boss";

async function main() {
  const boss = await getBoss();
  console.log(`[worker] started; listening on "${QUEUE_PARSE_STATEMENT}"`);

  await boss.work<ParseStatementJob>(QUEUE_PARSE_STATEMENT, async (jobs) => {
    for (const job of jobs) {
      console.log(`[worker] processing statement ${job.data.statementId}`);
      // The parsing pipeline is wired in here in Phase 6.11.
    }
  });

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`[worker] ${signal} received; stopping gracefully…`);
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error) => {
  console.error("[worker] fatal error", error);
  process.exit(1);
});
