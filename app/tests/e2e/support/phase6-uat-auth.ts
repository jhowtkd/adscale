/**
 * Stable auth for Phase 6 UAT: storageState file + cookie consent.
 */
import fs from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "@playwright/test";

export const UAT_EMAIL = "dev-admin@adscale.local";
export const UAT_PASSWORD = "DevAdmin123!";

export const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../fixtures/phase6-uat.json"
);
export const STORAGE_STATE_PATH = path.resolve(
  __dirname,
  "../../fixtures/phase6-uat-storage.json"
);

export type Phase6UatFixture = {
  email: string;
  password: string;
  workspaceId: string;
  userId: string;
  clientProfileId: string;
  campaignId: string;
  campaignName: string;
  derivationId: string;
  templateId: string;
  templateName: string;
  workId: string;
  workResumeHref: string;
  emptySearch: string;
  seededAt: string;
};

export function loadPhase6Fixture(): Phase6UatFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(
      `Missing ${FIXTURE_PATH}. Run: npm run seed:phase6-uat`
    );
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Phase6UatFixture;
}

async function dismissOverlays(page: Page) {
  await page
    .addStyleTag({
      content: `
        .tsqd-parent-container, .tsqd-open-btn-container { display:none !important; pointer-events:none !important; }
        [data-agentation], .agentation, #agentation-root { display:none !important; pointer-events:none !important; }
      `,
    })
    .catch(() => undefined);
  const accept = page.getByRole("button", {
    name: /aceitar todos|accept all|apenas necess|only necessary/i,
  });
  if (await accept.first().isVisible({ timeout: 800 }).catch(() => false)) {
    await accept.first().click({ force: true }).catch(() => undefined);
  }
}

/** Fresh login and write storage state (call once in globalSetup or first test). */
export async function ensureStorageState(browser: Browser): Promise<void> {
  const ageMs = fs.existsSync(STORAGE_STATE_PATH)
    ? Date.now() - fs.statSync(STORAGE_STATE_PATH).mtimeMs
    : Infinity;
  // Reuse for 30 minutes
  if (ageMs < 30 * 60 * 1000) return;

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false })
    );
  });
  await page.goto("/login", { waitUntil: "load", timeout: 60_000 });
  await dismissOverlays(page);
  await page.locator("#email").waitFor({ state: "visible", timeout: 20_000 });
  await page.locator("#email").click();
  await page.locator("#email").fill("");
  await page.locator("#email").pressSequentially(UAT_EMAIL, { delay: 8 });
  await page.locator("#login-password").click();
  await page.locator("#login-password").fill("");
  await page
    .locator("#login-password")
    .pressSequentially(UAT_PASSWORD, { delay: 8 });
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 60_000,
  });
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  await context.close();
}

export async function openAuthedPage(
  browser: Browser,
  options?: { viewport?: { width: number; height: number }; isMobile?: boolean }
): Promise<{ context: BrowserContext; page: Page }> {
  await ensureStorageState(browser);
  const context = await browser.newContext({
    storageState: STORAGE_STATE_PATH,
    viewport: options?.viewport ?? { width: 1440, height: 900 },
    isMobile: options?.isMobile,
    hasTouch: options?.isMobile,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false })
    );
  });
  return { context, page };
}

export async function gotoApp(page: Page, pathName: string) {
  await page.goto(pathName, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(500);
  await dismissOverlays(page);
}
