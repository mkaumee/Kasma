"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Polls the server (via a Server Component refresh) while any statement is
 * still being parsed, so the list and status badges update live without a
 * websocket. Renders nothing.
 */
export function StatementsRefresher({
  active,
  intervalMs = 4000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);

  return null;
}
