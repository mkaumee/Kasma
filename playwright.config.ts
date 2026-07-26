import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

/**
 * Playwright config for critical-flow E2E. By default it starts the dev server
 * itself (reusing an already-running one). Requires DATABASE_URL + AUTH_SECRET
 * in the environment. Chromium is pre-provisioned in CI; run `pnpm test:e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Allow pointing at a pre-provisioned browser (some CI/sandboxes ship
        // Chromium already); otherwise Playwright uses its managed download.
        launchOptions: process.env.PW_EXECUTABLE_PATH
          ? { executablePath: process.env.PW_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
});
