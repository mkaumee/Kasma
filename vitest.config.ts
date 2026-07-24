import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve the "@/*" tsconfig path alias natively (Vitest 4+).
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // DB-backed tests share one Postgres, so run files serially to keep state
    // deterministic.
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});
