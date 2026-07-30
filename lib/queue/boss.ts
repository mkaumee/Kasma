import { PgBoss } from "pg-boss";

import { env } from "@/lib/env";

export const QUEUE_PARSE_STATEMENT = "parse-statement";

export type ParseStatementJob = {
  statementId: string;
  organizationId: string;
};

let bossPromise: Promise<PgBoss> | undefined;

/** A shared pg-boss instance (started + queues created), one per process. */
export async function getBoss(): Promise<PgBoss> {
  if (!bossPromise) {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for the job queue.");
    }
    const boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      // pg-boss polls continuously, so a slow connect turns into a stream of
      // "Connection terminated due to connection timeout" errors. The default
      // 30s is tight when reaching Postgres over a public TCP proxy; prefer the
      // provider's private hostname too (see docs/DEPLOYMENT.md).
      connectionTimeoutMillis: 60_000,
      // A single worker process doesn't need a large pool, and a smaller one is
      // gentler on connection-limited managed Postgres.
      max: 5,
      // Identifies these connections in pg_stat_activity.
      application_name: "kasma-worker",
    });
    boss.on("error", (error) => console.error("[pg-boss]", error));
    bossPromise = boss.start().then(async (started) => {
      await started.createQueue(QUEUE_PARSE_STATEMENT);
      return started;
    });
  }
  return bossPromise;
}

/** Enqueue a statement for background parsing. */
export async function enqueueParseStatement(
  data: ParseStatementJob,
): Promise<void> {
  const boss = await getBoss();
  await boss.send(QUEUE_PARSE_STATEMENT, data);
}
