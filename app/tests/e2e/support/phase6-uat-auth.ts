/**
 * Stable auth + navigation for Phase 6 UAT.
 * Prefer waitUntil "commit" — Next dev can stall on "domcontentloaded"/"load"
 * under HMR without that being a product failure.
 */
import fs from "node:fs";
import path from "node:path";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";

export const UAT_EMAIL = "dev-admin@adscale.local";
export const UAT_PASSWORD = "DevAdmin123!";

const VIEWPORTS = {
  "1440x900": { width: 1440, height: 900 },
  "1280x800": { width: 1280, height: 800 },
  "390x844": { width: 390, height: 844 },
  "360x800": { width: 360, height: 800 },
} as const;

export type UatViewportLabel = keyof typeof VIEWPORTS;

function resolveUatViewport(): UatViewportLabel {
  const requested = process.env.PHASE6_UAT_VIEWPORT ?? "1440x900";
  if (requested in VIEWPORTS) return requested as UatViewportLabel;
  throw new Error(
    `Unsupported PHASE6_UAT_VIEWPORT=${requested}. Expected: ${Object.keys(VIEWPORTS).join(", ")}`
  );
}

export const UAT_VIEWPORT_LABEL = resolveUatViewport();
export const UAT_VIEWPORT = VIEWPORTS[UAT_VIEWPORT_LABEL];
export const UAT_IS_MOBILE = UAT_VIEWPORT.width <= 480;

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
  previewFlowCampaignId: string;
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
  // Create the same Better Auth session as the login form without depending on
  // Next dev hydrating that form while provider UAT is consuming CPU/memory.
  // `page.request` shares the page context cookie jar.
  const response = await page.request.post("/api/auth/sign-in/email", {
    data: { email: UAT_EMAIL, password: UAT_PASSWORD },
    timeout: 30_000,
  });
  if (!response.ok()) {
    throw new Error(`UAT login failed with status ${response.status()}`);
  }
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
        const [worksResponse, sessionResponse] = await Promise.all([
          fetch("/api/creative-work"),
          fetch("/api/auth/get-session"),
        ]);
        if (!worksResponse.ok || !sessionResponse.ok) {
          return { ok: false as const, email: null };
        }
        const auth = (await sessionResponse.json()) as {
          user?: { email?: string | null } | null;
        };
        return {
          ok: auth.user?.email === "dev-admin@adscale.local",
          email: auth.user?.email ?? null,
        };
      });
      await probe.close();
      // A generic authenticated starter account can also return 200 here.
      // The deterministic fixtures belong specifically to dev-admin.
      if (session.ok) return;
    } catch {
      await probe.close().catch(() => undefined);
    }
    fs.unlinkSync(STORAGE_STATE_PATH);
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  await performLogin(page);
  // Confirm the exact deterministic owner without requiring any page bundle.
  const sessionResponse = await context.request.get("/api/auth/get-session");
  const session = sessionResponse.ok()
    ? ((await sessionResponse.json()) as {
        user?: { email?: string | null } | null;
      })
    : null;
  if (session?.user?.email !== UAT_EMAIL) {
    throw new Error(
      `post-login session belongs to ${session?.user?.email ?? "no user"}`
    );
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
    viewport: options?.viewport ?? UAT_VIEWPORT,
    isMobile: options?.isMobile ?? UAT_IS_MOBILE,
    hasTouch: options?.isMobile ?? UAT_IS_MOBILE,
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
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(pathName, { waitUntil: "commit", timeout: 45_000 });
      await dismissOverlays(page);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const transientRestart = /ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ECONNRESET/i.test(
        message
      );
      if (!transientRestart || attempt === 3) throw error;
      // Next dev intentionally restarts when its memory threshold is reached.
      // Retry only that short transport outage; HTTP/product failures are not
      // swallowed and still fail the scenario.
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw lastError;
}

/** Wait until Trabalhos product title shows a numeric count (hydrated). */
export async function waitTrabalhosHydrated(page: Page) {
  const title = page.locator("h1.product-page-title").first();
  await expect
    .poll(
      async () => (await title.textContent().catch(() => ""))?.trim() ?? "",
      { timeout: 90_000, intervals: [250, 500, 1_000, 2_000] },
    )
    .toMatch(/\d+\s+(trabalhos|works)/i);
}

/** Wait until campaign workspace stage strip is interactive. */
export async function waitWorkspaceStages(page: Page, timeout = 90_000) {
  const briefing = page
    .locator("button:visible")
    .filter({ hasText: /briefing/i })
    .first();
  const missionInsightDialog = page.getByRole("dialog").filter({
    hasText: /nota rápida do lab|quick lab note/i,
  });
  const missionInsightDismiss = missionInsightDialog
    .getByRole("button", { name: /agora não|not now|pular|skip/i })
    .first();

  await expect
    .poll(
      async () => {
        // The mission-insight prompt can arrive after navigation settles. Its
        // modal marks the workspace inert, so role locators correctly exclude
        // the otherwise-rendered stage strip until the prompt is dismissed.
        if (
          await missionInsightDismiss
            .isVisible({ timeout: 100 })
            .catch(() => false)
        ) {
          await missionInsightDismiss
            .evaluate((button: HTMLButtonElement) => button.click())
            .catch(() => undefined);
          return false;
        }
        if (await missionInsightDialog.isVisible().catch(() => false)) return false;
        return briefing.isVisible().catch(() => false);
      },
      { timeout, intervals: [100, 250, 500, 1_000] }
    )
    .toBe(true);
}

export async function dismissMissionInsight(page: Page): Promise<boolean> {
  const dialog = page.getByRole("dialog").filter({
    hasText: /nota rápida do lab|quick lab note/i,
  });
  const dismiss = dialog
    .getByRole("button", { name: /agora não|not now|pular|skip/i })
    .first();
  if (!(await dismiss.isVisible({ timeout: 100 }).catch(() => false))) return false;
  await dismiss.evaluate((button: HTMLButtonElement) => button.click());
  await expect(dialog).toBeHidden({ timeout: 5_000 });
  return true;
}
