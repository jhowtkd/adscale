import type { Locator, Page } from "@playwright/test";

export const GUIDED_E2E_EMAIL = "dev-admin@adscale.local";
export const GUIDED_E2E_PASSWORD = "DevAdmin123!";

/**
 * Authenticated login for guided journey E2E with retry and cookie consent.
 * Mirrors visual-auth resilience to reduce intermittent login flakes.
 */
export async function loginGuidedJourney(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false })
    );
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await page.request.post("/api/auth/sign-in/email", {
      data: { email: GUIDED_E2E_EMAIL, password: GUIDED_E2E_PASSWORD },
    });

    if (response.ok()) {
      await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (!page.url().includes("/login")) {
        return;
      }
    }

    if (attempt === 2) {
      throw new Error(
        `guided login failed after 3 attempts (last status ${response.status()})`
      );
    }

    await page.waitForTimeout(1_500);
  }
}

export function assistantSurface(page: Page): Locator {
  return page.locator(
    '[data-testid="assistant-desktop-main"]:visible, [data-testid="assistant-mobile-chat"]:visible'
  );
}

export async function mockClientProfiles(page: Page): Promise<void> {
  const createdAt = "2026-06-26T12:00:00.000Z";
  await page.route("**/api/client-profiles", async (route) => {
    await route.fulfill({
      json: {
        profiles: [
          {
            id: "client-e2e",
            workspaceId: "workspace-e2e",
            name: "Cliente E2E",
            description: null,
            visualNotes: null,
            toneNotes: null,
            constraints: null,
            createdAt,
            updatedAt: createdAt,
          },
        ],
      },
    });
  });
}
