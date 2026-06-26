import { expect, test, type Page } from "@playwright/test";

/**
 * v13.6 guided journey smoke — authenticated shell + journey cards.
 * Full propose→confirm lifecycle remains in unit/integration tests.
 */

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
}

test.describe("guided assistant journeys", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("start surface shows both guided journey cards", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/assistant");

    await expect(page.getByTestId("assistant-journey-cards")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByTestId("assistant-journey-card-existing_creative")
    ).toBeVisible();
    await expect(page.getByTestId("assistant-journey-card-from_zero")).toBeVisible();
  });

  test("mobile layout shows journey cards without overlap", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/assistant");

    const cards = page.getByTestId("assistant-journey-cards");
    await expect(cards).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("assistant-start-form")).toBeVisible();
  });
});
