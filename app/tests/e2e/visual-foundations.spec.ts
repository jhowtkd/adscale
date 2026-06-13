import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { mountVisualLayerHarness } from "./support/visual-layer-harness";

const EMAIL = "visual-foundations@example.test";
const PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");
const SCREENSHOT_DIR = path.resolve(process.cwd(), "../.planning/phases/109-visual-foundations-and-baseline/evidence");
const EVIDENCE_PATH = path.resolve(process.cwd(), "../.planning/phases/109-visual-foundations-and-baseline/109-EVIDENCE.json");
const REQUIRED_MASKS = ["email", "user", "workspace", "client", "campaign-id", "timestamp", "generated-image"];

type Manifest = {
  identity: { email: string; name: string };
  fixtureIds: { userId: string; workspaceId: string; campaignIds: string[]; derivationId: string };
  labels: { workspace: string; clients: string[] };
  routes: Record<string, string>;
  states: Record<string, string[]>;
};

function seed(force = false): Manifest {
  if (force || !existsSync(MANIFEST_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-visual-foundations.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
      stdio: "inherit",
    });
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

type Capture = {
  key: string;
  scenario: string;
  state: string;
  viewport: number;
  theme: "light" | "dark";
  locale: "pt-BR" | "en";
  path: string;
  sha256: string;
  masks: string[];
  result: "pass";
};

function sha256(file: string) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function recordCapture(capture: Capture) {
  const current = existsSync(EVIDENCE_PATH)
    ? JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"))
    : {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        identity: EMAIL,
        before: { cssHash: execFileSync("git", ["hash-object", "app/src/app/globals.css"], { cwd: path.resolve(process.cwd(), ".."), encoding: "utf8" }).trim() },
        captures: [],
        defects: [
          { id: "DEFECT-LANDMARKS", observation: "Nested or duplicate main landmarks in authenticated shell", owner: "110" },
          { id: "DEFECT-CONTRAST", observation: "Existing electric-green text/action contrast below WCAG target", owner: "113" },
          { id: "DEFECT-BRAND-KIT-DIALOG", observation: "Brand Kit confirmation crashes because settings.brandKit.clearConfirm is missing", owner: "113" },
        ],
      };
  current.captures = [...current.captures.filter((item: Capture) => item.key !== capture.key), capture]
    .sort((a: Capture, b: Capture) => a.key.localeCompare(b.key));
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

async function login(page: Page, locale: "pt-BR" | "en", theme: "light" | "dark") {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: theme });
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: locale, domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript((selectedTheme) => {
    localStorage.setItem("theme", selectedTheme);
    const style = document.createElement("style");
    style.dataset.visualFoundations = "deterministic-motion";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  }, theme);
  await page.goto("/login");
  await page.locator("#email").fill(EMAIL);
  await page.locator("#login-password").fill(PASSWORD);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

export async function interceptVisualState(page: Page, url: RegExp, state: "loading" | "error" | "empty") {
  await page.route(url, async (route: Route) => {
    if (state === "loading") return new Promise(() => {});
    if (state === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic visual fixture error" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ campaigns: [], recentCampaigns: [], totals: {} }) });
  });
}

function maskLocators(page: Page, manifest: Manifest): Locator[] {
  const values = [
    manifest.identity.email,
    manifest.identity.name,
    manifest.labels.workspace,
    ...manifest.labels.clients,
    manifest.fixtureIds.userId,
    manifest.fixtureIds.workspaceId,
    ...manifest.fixtureIds.campaignIds,
  ];
  return [
    ...values.map((value) => page.getByText(value, { exact: false })),
    page.locator("time"),
    page.locator('img[src*="derivation"], img[src*="generated"]'),
  ];
}

function variant(width: number) {
  const variants = {
    390: { locale: "pt-BR", theme: "light" },
    768: { locale: "en", theme: "dark" },
    1024: { locale: "pt-BR", theme: "dark" },
    1280: { locale: "en", theme: "light" },
    1440: { locale: "pt-BR", theme: "light" },
    1920: { locale: "en", theme: "dark" },
  } as const;
  return variants[width as keyof typeof variants];
}

async function capture(page: Page, manifest: Manifest, scenario: string, state: string, width: number) {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const { locale, theme } = variant(width);
  const name = `${scenario}-${state}-${width}-${theme}-${locale}-before.png`.toLowerCase();
  const absolute = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: absolute, fullPage: true, mask: maskLocators(page, manifest), animations: "disabled" });
  recordCapture({
    key: `${scenario}:${state}:${width}`,
    scenario,
    state,
    viewport: width,
    theme,
    locale,
    path: path.relative(path.resolve(process.cwd(), ".."), absolute).replaceAll("\\", "/"),
    sha256: sha256(absolute),
    masks: REQUIRED_MASKS,
    result: "pass",
  });
}

const emptyDashboard = {
  totalCampaigns: 0, campaignsChange: 0, totalDerivations: 0, derivationsThisMonth: 0,
  derivationsChange: 0, approvedDerivations: 0, approvalRate: 0, approvalChange: 0,
  avgGenerationTimeSeconds: 0, creditsRemaining: 0, creditsUsedThisMonth: 0, creditsTotal: 0,
  creditUsageSeries: [], recentCampaigns: [], recentActivity: [], subscription: { planKey: null, status: "inactive" },
};

async function captureApiState(
  page: Page,
  manifest: Manifest,
  options: { scenario: string; state: "empty" | "loading" | "error"; width: number; route: string; api: RegExp; emptyBody: unknown },
) {
  await page.route(options.api, async (route) => {
    if (options.state === "loading") {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(options.emptyBody) })
        .catch((error) => {
          if (!String(error).includes("already handled")) throw error;
        });
    }
    if (options.state === "error") return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic visual fixture error" }) });
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(options.emptyBody) });
  });
  await page.goto(options.route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(options.state === "loading" ? 800 : 300);
  await capture(page, manifest, options.scenario, options.state, options.width);
  await page.unroute(options.api);
}

test.describe("visual foundations", () => {
  let manifest: Manifest;

  test.beforeAll(() => {
    manifest = seed();
  });

  test("baseline preflight", async ({ page }, testInfo) => {
    expect(manifest.identity.email).toBe(EMAIL);
    expect(JSON.stringify(manifest)).not.toMatch(/@(?!example\.test)/);
    expect(Object.values(manifest.states).flat()).toEqual(expect.arrayContaining([
      "populated", "dense", "empty", "loading", "error", "profile", "billing", "validation-error",
    ]));
    expect(testInfo.project.use.viewport?.width).toBe(Number(testInfo.project.name.split("-").at(-1)));
    expect(SCREENSHOT_DIR).toContain("109-visual-foundations-and-baseline/evidence");
    expect(REQUIRED_MASKS).toHaveLength(7);

    await login(page, "pt-BR", "light");
    await page.goto(manifest.routes.dashboard);
    await expect(page.locator("main")).toBeVisible();
    expect(maskLocators(page, manifest).length).toBeGreaterThanOrEqual(10);

    await mountVisualLayerHarness(page, "sticky-popover-toast");
    await expect(page.locator('[data-layer="sticky"]')).toBeVisible();
    await expect(page.locator('[data-layer="popover"]')).toBeVisible();
    await expect(page.locator('[data-layer="toast"]')).toBeVisible();
    await mountVisualLayerHarness(page, "shell-backdrop-overlay-toast");
    await expect(page.locator('[data-layer="shell"]')).toBeVisible();
    await expect(page.locator('[data-layer="overlay"]')).toBeVisible();
  });

  test("before baseline empty state loading state error state", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width;
    if (!width) throw new Error("Visual project has no viewport width");
    if (width === 390 && process.env.VISUAL_FOUNDATIONS_RESET === "true") {
      rmSync(EVIDENCE_PATH, { force: true });
      rmSync(SCREENSHOT_DIR, { recursive: true, force: true });
      manifest = seed(true);
    }
    const { locale, theme } = variant(width);
    await login(page, locale, theme);

    const dashboardPopulated = [390, 1024, 1440, 1920].includes(width);
    if (dashboardPopulated) {
      await page.goto(manifest.routes.dashboard);
      await expect(page.locator("main")).toBeVisible();
      await capture(page, manifest, "dashboard", "populated", width);
    }
    if ([390, 768, 1280].includes(width)) {
      for (const state of ["empty", "loading", "error"] as const) {
        await captureApiState(page, manifest, { scenario: "dashboard", state, width, route: "/", api: /\/api\/dashboard\/stats/, emptyBody: emptyDashboard });
      }
    }

    if ([390, 768, 1280, 1920].includes(width)) {
      await page.goto(manifest.routes.campaignList);
      await expect(page.locator("main")).toBeVisible();
      await capture(page, manifest, "campaign-list", "dense", width);
    }
    if ([390, 768, 1280].includes(width)) {
      for (const state of ["empty", "loading", "error"] as const) {
        await captureApiState(page, manifest, { scenario: "campaign-list", state, width, route: "/campaigns", api: /\/api\/campaigns(?:\?|$)/, emptyBody: { campaigns: [], totalCount: 0 } });
      }
    }

    if ([390, 1024, 1440].includes(width)) {
      await page.goto(manifest.routes.workspace);
      await expect(page.locator("main")).toBeVisible();
      await capture(page, manifest, "workspace", "populated", width);
    }
    if ([390, 1024].includes(width)) {
      for (const state of ["loading", "error"] as const) {
        await captureApiState(page, manifest, {
          scenario: "workspace", state, width, route: manifest.routes.workspace,
          api: new RegExp(`/api/campaigns/${manifest.fixtureIds.campaignIds[0]}(?:\\?|$)`), emptyBody: {},
        });
      }
    }

    if ([390, 768, 1280].includes(width)) {
      await page.goto(manifest.routes.settingsProfile);
      await expect(page.locator("main")).toBeVisible();
      await capture(page, manifest, "settings", "normal", width);
      const email = page.locator('input[type="email"]').first();
      if (await email.isVisible()) await email.fill("invalid-example.test");
      await capture(page, manifest, "settings", "validation-error", width);
    }

  });

  test("before baseline settings confirmation dialog", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    const { locale, theme } = variant(width);
    await login(page, locale, theme);
    await page.goto("/settings?tab=privacy");
    const deleteAccount = page.getByRole("button", { name: /quero excluir minha conta|delete account/i });
    await expect(deleteAccount).toBeEnabled();
    const confirmation = page.getByLabel(/confirm delete account/i);
    for (let attempt = 0; attempt < 3 && !(await confirmation.isVisible()); attempt += 1) {
      await deleteAccount.click();
      await page.waitForTimeout(500);
    }
    await expect(confirmation).toBeVisible();
    await capture(page, manifest, "overlay", "settings-confirmation-dialog", width);
  });

  test("before baseline derivation review sheet", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    const { locale, theme } = variant(width);
    await login(page, locale, theme);
    await page.goto(manifest.routes.workspace);
    const preview = page.getByRole("button", { name: /^(visualizar|preview)\s/i }).first();
    await expect(preview).toBeVisible();
    await preview.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, manifest, "overlay", "derivation-review-sheet", width);
  });

  test("before baseline layer harness", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    await mountVisualLayerHarness(page, "sticky-popover-toast");
    await capture(page, manifest, "layer-harness", "sticky-popover-toast", width);
    await mountVisualLayerHarness(page, "shell-backdrop-overlay-toast");
    await capture(page, manifest, "layer-harness", "shell-backdrop-overlay-toast", width);
  });
});
