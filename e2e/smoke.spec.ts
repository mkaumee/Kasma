import { expect, test } from "@playwright/test";

test.describe("smoke", () => {
  test("landing page renders and links to auth", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Kasma/i);
    // A sign-in / get-started entry point exists.
    await expect(
      page.getByRole("link", { name: /sign in|log in|get started|sign up/i }).first(),
    ).toBeVisible();
  });

  test("login page shows the sign-in form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test("health endpoint reports ok", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
