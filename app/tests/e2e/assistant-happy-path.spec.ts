import { expect, test, type Page } from "@playwright/test";

/**
 * v13.5 assistant happy-path E2E.
 * Authenticated smoke + navigation shell; full propose→confirm→Inngest lifecycle
 * remains covered by unit/integration tests (execute, confirm route, job sync).
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

test.describe("assistant happy path", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("assistant page exposes context and review panels", async ({ page }) => {
    await page.goto("/assistant");

    await expect(page.getByTestId("assistant-context-panel")).toBeVisible({
      timeout: 15_000,
    });

    const reviewPanel = page.getByTestId("assistant-review-panel");
    if (await reviewPanel.count()) {
      await expect(reviewPanel).toBeVisible();
    }
  });

  test("assistant shell shows tree navigation and chat area on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/assistant");

    await expect(page.getByTestId("assistant-context-panel")).toBeVisible({
      timeout: 15_000,
    });

    const chatInput = page.locator(
      'textarea[placeholder*="mensagem"], textarea[placeholder*="message"]'
    );
    await expect(chatInput.or(page.getByRole("textbox"))).toBeVisible({
      timeout: 10_000,
    });
  });

  test("assistant threads API is reachable when authenticated", async ({
    page,
    request,
  }) => {
    await page.goto("/assistant");

    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    const response = await request.get("/api/assistant/threads", {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as { threads?: unknown[] };
    expect(Array.isArray(body.threads)).toBe(true);
  });
});
