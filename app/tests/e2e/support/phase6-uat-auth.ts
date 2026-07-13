/**
 * Stable auth + navigation for Phase 6 UAT.
 * Prefer waitUntil "commit" — Next dev can stall on "domcontentloaded"/"load"
 * under HMR without that being a product failure.
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
  previewOkCampaignId: string;
  previewOkDerivationId: string;
  previewBadCampaignId: string;
  previewBadDerivationId: string;
  libraryWorkId: string;
  libraryOutputId: string;
  libraryWorkHref: string;
  emptySearch: string;
  seededAt: string;
};

export function loadPhase6Fixture(): Phase6UatFixture {
  if (!fs.existsSync(FIXTURE_PATH)) {
    throw new Error(`Missing ${FIXTURE_PATH}. Run: npm run seed:phase6-uat`);
  }
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Phase6UatFixture;
}

export async function dismissOverlays(page: Page) {
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
  if (await accept.first().isVisible({ timeout: 600 }).catch(() => false)) {
    await accept.first().click({ force: true }).catch(() => undefined);
  }
}

async function performLogin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "adscale_cookie_consent",
      JSON.stringify({ necessary: true, analytics: false, marketing: false })
    );
  });
  // "load" ensures client bundle hydrated controlled form handlers
  await page.goto("/login", { waitUntil: "load", timeout: 45_000 });
  await page.waitForSelector("#email", { state: "visible", timeout: 15_000 });
  await dismissOverlays(page);

  // Controlled React inputs: type so onChange updates reducer state
  await page.locator("#email").click();
  await page.locator("#email").fill(UAT_EMAIL);
  await page.locator("#login-password").click();
  await page.locator("#login-password").fill(UAT_PASSWORD);

  // Confirm DOM holds values before submit (still not a relaxed timeout)
  const emailVal = await page.locator("#email").inputValue();
  const passLen = (await page.locator("#login-password").inputValue()).length;
  if (emailVal !== UAT_EMAIL || passLen !== UAT_PASSWORD.length) {
    throw new Error(
      `login form values not sticky (email=${emailVal} passLen=${passLen})`
    );
  }

  // Prefer keyboard submit so React form onSubmit always fires with current state
  await page.locator("#login-password").press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await dismissOverlays(page);
}

/** Validate storage as dev-admin with working API; re-login otherwise. */
export async function ensureStorageState(browser: Browser): Promise<void> {
  if (fs.existsSync(STORAGE_STATE_PATH)) {
    const probe = await browser.newContext({
      storageState: STORAGE_STATE_PATH,
    });
    const page = await probe.newPage();
    try {
      await page.goto("/campaigns", { waitUntil: "commit", timeout: 30_000 });
      const session = await page.evaluate(async () => {
        const r = await fetch("/api/creative-work");
        if (!r.ok) return { ok: false as const, n: 0 };
        const j = (await r.json()) as { works?: unknown[] };
        return {
          ok: true as const,
          n: Array.isArray(j.works) ? j.works.length : -1,
        };
      });
      await probe.close();
      // Auth ok if creative-work 200 (do not parse sidebar labels — flaky placeholders)
      if (session.ok) return;
    } catch {
      await probe.close().catch(() => undefined);
    }
    fs.unlinkSync(STORAGE_STATE_PATH);
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await performLogin(page);
  // Confirm API auth after login
  await page.goto("/campaigns", { waitUntil: "commit", timeout: 30_000 });
  const session = await page.evaluate(async () => {
    const r = await fetch("/api/creative-work");
    return r.status;
  });
  if (session !== 200) {
    throw new Error(`post-login creative-work status ${session}`);
  }
  fs.mkdirSync(path.dirname(STORAGE_STATE_PATH), { recursive: true });
  await context.storageState({ path: STORAGE_STATE_PATH });
  await context.close();
}

export async function openAuthedPage(
  browser: Browser,
  options?: {
    viewport?: { width: number; height: number };
    isMobile?: boolean;
  }
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
  await page.goto(pathName, { waitUntil: "commit", timeout: 45_000 });
  await dismissOverlays(page);
}

/** Wait until Trabalhos product title shows a numeric count (hydrated). */
export async function waitTrabalhosHydrated(page: Page) {
  await page
    .locator("h1.product-page-title")
    .filter({ hasText: /\d+\s+(trabalhos|works)/i })
    .waitFor({ state: "visible", timeout: 30_000 });
}

/** Wait until campaign workspace stage strip is interactive. */
export async function waitWorkspaceStages(page: Page) {
  await page
    .getByRole("button", { name: /briefing/i })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}
