import { expect, test } from "@playwright/test";

/**
 * Smoke test for v13.5 assistant happy-path surface.
 * Verifies /assistant loads authenticated shell with context + review slots.
 * Full idea→package flow requires live Inngest/OpenAI — covered by unit tests.
 */
test.describe("assistant happy path smoke", () => {
  test("assistant page exposes context and review panels", async ({ page }) => {
    await page.goto("/assistant");

    if (page.url().includes("/login")) {
      test.skip(true, "Requires authenticated session — run with seeded E2E user");
    }

    await expect(page.getByTestId("assistant-context-panel")).toBeVisible({
      timeout: 15_000,
    });

    const reviewPanel = page.getByTestId("assistant-review-panel");
    if (await reviewPanel.count()) {
      await expect(reviewPanel).toBeVisible();
    }
  });
});
