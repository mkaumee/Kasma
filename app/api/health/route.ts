import { prisma } from "@/lib/db/client";

/**
 * Public readiness probe: verifies the process is up and the database is
 * reachable. Returns 200 when healthy, 503 when the DB check fails. No auth so
 * load balancers / uptime checks can hit it; it exposes no sensitive data.
 */
export async function GET() {
  let db: "up" | "down" = "up";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    db = "down";
  }
  const ok = db === "up";
  return Response.json(
    { status: ok ? "ok" : "degraded", db, time: new Date().toISOString() },
    { status: ok ? 200 : 503 },
  );
}
