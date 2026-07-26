import { expect, test } from "@playwright/test";

/**
 * Critical flow: a new user signs up, creates an organization in onboarding,
 * and lands on the dashboard. Requires a running app + database.
 */
test("sign up → create org → dashboard", async ({ page }) => {
  const unique = Date.now();
  const email = `e2e-${unique}@kasma.test`;

  await page.goto("/signup");
  await page.getByLabel(/name/i).fill("E2E User");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill("password123!");
  await page.getByRole("button", { name: /sign up|create account/i }).click();

  // New users have no org yet → onboarding.
  await page.waitForURL(/\/onboarding/, { timeout: 15_000 });
  await page.getByLabel(/organization|company|name/i).first().fill(
    `E2E Co ${unique}`,
  );
  await page
    .getByRole("button", { name: /create|continue|get started/i })
    .first()
    .click();

  await page.waitForURL(/\/dashboard/, { timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: /dashboard/i }),
  ).toBeVisible();
});
