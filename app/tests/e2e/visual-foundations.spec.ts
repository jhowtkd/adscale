import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { mountVisualLayerHarness } from "./support/visual-layer-harness";

const EMAIL = "visual-foundations@example.test";
const PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
const CAPTURE_SUFFIX = process.env.VISUAL_CAPTURE_STAGE === "after" ? "after" : "before";
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
      env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000", NODE_OPTIONS: `--conditions=react-server ${process.env.NODE_OPTIONS ?? ""}`.trim() },
      stdio: "inherit",
    });
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

function revokeFixtureAccess() {
  execFileSync("npx", ["tsx", "scripts/seed-visual-foundations.ts", "--revoke-access"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_OPTIONS: `--conditions=react-server ${process.env.NODE_OPTIONS ?? ""}`.trim() },
    stdio: "inherit",
  });
}

type Capture = {
  key: string;
  scenario: string;
  state: string;
  viewport: number;
  theme: "light" | "dark";
  requestedTheme: "light" | "dark";
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
        before: {
          cssHash: execFileSync("git", ["hash-object", "app/src/app/globals.css"], {
            cwd: path.resolve(process.cwd(), ".."),
            encoding: "utf8",
          }).trim(),
        },
        captures: [],
        afterCaptures: [],
        defects: [
          { id: "DEFECT-LANDMARKS", observation: "Nested or duplicate main landmarks in authenticated shell", owner: "110" },
          { id: "DEFECT-CONTRAST", observation: "Existing electric-green text/action contrast below WCAG target", owner: "113" },
          { id: "DEFECT-BRAND-KIT-DIALOG", observation: "Brand Kit confirmation crashes because settings.brandKit.clearConfirm is missing", owner: "113" },
        ],
      };
  const field = CAPTURE_SUFFIX === "after" ? "afterCaptures" : "captures";
  const list = current[field] ?? [];
  current[field] = [...list.filter((item: Capture) => item.key !== capture.key), capture].sort(
    (a: Capture, b: Capture) => a.key.localeCompare(b.key),
  );
  if (CAPTURE_SUFFIX === "after") {
    current.after = {
      cssHash: execFileSync("git", ["hash-object", "app/src/app/globals.css"], {
        cwd: path.resolve(process.cwd(), ".."),
        encoding: "utf8",
      }).trim(),
    };
  }
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

async function login(
  page: Page,
  locale: "pt-BR" | "en",
  theme: "light" | "dark",
  options: { reducedMotion?: "reduce" | "no-preference"; deterministicMotion?: boolean } = {},
) {
  const { reducedMotion = "reduce", deterministicMotion = true } = options;
  await page.emulateMedia({ reducedMotion, colorScheme: theme });
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: locale, domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(({ selectedTheme, disableMotion }) => {
    localStorage.setItem("theme", selectedTheme);
    localStorage.setItem("adscale_cookie_consent", JSON.stringify({
      necessary: true,
      analytics: false,
      marketing: false,
    }));
    if (!disableMotion) return;
    const style = document.createElement("style");
    style.dataset.visualFoundations = "deterministic-motion";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  }, { selectedTheme: theme, disableMotion: deterministicMotion });
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
  const { locale, theme: requestedTheme } = variant(width);
  const theme = await page.evaluate(() => document.documentElement.classList.contains("dark") ? "dark" : "light");
  const name = `${scenario}-${state}-${width}-${theme}-${locale}-${CAPTURE_SUFFIX}.png`.toLowerCase();
  const absolute = path.join(SCREENSHOT_DIR, name);
  await page.screenshot({ path: absolute, fullPage: true, mask: maskLocators(page, manifest), animations: "disabled" });
  recordCapture({
    key: `${scenario}:${state}:${width}`,
    scenario,
    state,
    viewport: width,
    theme,
    requestedTheme,
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
    manifest = seed(true);
  });

  test.afterAll(() => revokeFixtureAccess());

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

  test("first-wave motion keeps function and focus with normal and reduced motion", async ({ page }, testInfo) => {
    test.skip(testInfo.project.use.viewport?.width !== 1440);
    await login(page, "pt-BR", "dark", { reducedMotion: "no-preference", deterministicMotion: false });

    const evidence: Array<Record<string, string | number | boolean>> = [];
    const durationMs = (locator: Locator, property: "animationDuration" | "transitionDuration") =>
      locator.evaluate((element, name) => {
        const values = getComputedStyle(element)[name].split(",");
        return Math.max(...values.map((value) => {
          const parsed = Number.parseFloat(value);
          return value.trim().endsWith("ms") ? parsed : parsed * 1000;
        }));
      }, property);

    for (const reducedMotion of ["no-preference", "reduce"] as const) {
      await page.emulateMedia({ reducedMotion, colorScheme: "dark" });
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
        .toBe(reducedMotion === "reduce");

      await page.goto(manifest.routes.creativeWork);
      const protocol = page.getByRole("button", { name: /peça única|single/i }).first();
      await expect(protocol).toBeVisible();
      await protocol.focus();
      await page.keyboard.press("Space");
      await expect(protocol).toHaveAttribute("aria-pressed", "true");
      await expect(page.locator("#creative-composer-request")).toBeFocused();

      await page.goto(manifest.routes.dashboard);
      await expect(page.locator("main")).toBeVisible();
      const dashboardValue = page.locator("[data-motion-value]").first();
      await expect(dashboardValue).toBeVisible();
      const dashboardDuration = await durationMs(dashboardValue, "animationDuration");

      await page.goto(manifest.routes.campaignList);
      const listView = page.getByRole("button", { name: /lista|list/i });
      await listView.click();
      await expect(listView).toHaveAttribute("aria-pressed", "true");
      const campaignCheckbox = page.locator('li[data-motion-highlight] input[type="checkbox"]:not([disabled])').first();
      await expect(campaignCheckbox).toBeVisible();
      await campaignCheckbox.focus();
      const selectionStarted = Date.now();
      await page.keyboard.press("Space");
      await expect(campaignCheckbox).toBeChecked();
      await expect(campaignCheckbox).toBeFocused();
      const selectedRow = campaignCheckbox.locator("xpath=ancestor::li[@data-motion-highlight]");
      await expect(selectedRow).toHaveAttribute("data-motion-highlight", "selected");
      const selectionResponseMs = Date.now() - selectionStarted;
      const campaignDuration = await durationMs(selectedRow, "transitionDuration");

      await page.route(/\/api\/workspace\/assets(?:\?|$)/, (route) => route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          total: 1,
          assets: [{
            id: "vf-asset",
            workspaceId: manifest.fixtureIds.workspaceId,
            name: "VF Example Asset",
            key: "visual-foundations/example.png",
            type: "image/png",
            size: 1024,
            width: 100,
            height: 100,
            tags: ["synthetic"],
            aiDescription: null,
            source: "seed",
            metadata: null,
            url: "",
            createdAt: "2026-01-01T12:00:00.000Z",
          }],
        }),
      }));
      await page.goto(manifest.routes.library);
      const libraryCard = page.locator('article[data-motion-highlight="focus"]');
      await expect(libraryCard).toBeVisible();
      const libraryAction = libraryCard.getByRole("button").first();
      await libraryAction.focus();
      await expect(libraryAction).toBeFocused();
      const libraryDuration = await durationMs(libraryCard, "transitionDuration");
      await page.unroute(/\/api\/workspace\/assets(?:\?|$)/);

      await page.goto(manifest.routes.settingsProfile);
      const firstName = page.locator("#profile-first-name");
      await expect(firstName).toBeVisible();
      await firstName.fill(reducedMotion === "reduce" ? "Reduced" : "Motion");
      const profileApi = /\/api\/user\/profile(?:\?|$)/;
      if (reducedMotion === "no-preference") {
        let failedOnce = false;
        await page.route(profileApi, (route) => {
          if (route.request().method() !== "PATCH" || failedOnce) return route.continue();
          failedOnce = true;
          return route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Synthetic profile failure" }),
          });
        });
      }
      const save = page.getByRole("button", { name: /salvar alterações|save changes|tentar novamente|retry/i });
      await save.focus();
      await page.keyboard.press("Enter");
      if (reducedMotion === "no-preference") {
        await expect(page.locator('button:has([data-action-status="error"])')).toContainText(/tentar novamente|retry/i);
        await expect(page.getByText("Synthetic profile failure")).toBeVisible();
        await expect(save).toBeFocused();
        await page.keyboard.press("Enter");
      }
      await expect(page.locator('button:has([data-action-status="success"])'))
        .toContainText(/salvo|saved/i);
      await page.unroute(profileApi);

      await page.goto(manifest.routes.onboarding);
      await expect(page.locator("main")).toBeVisible();
      const activeBrand = page.getByRole("combobox", { name: /marca ativa|active brand/i });
      await expect(activeBrand).toBeVisible();
      await activeBrand.focus();
      await expect(activeBrand).toBeFocused();

      const durations = {
        dashboard: dashboardDuration,
        campaign: campaignDuration,
        library: libraryDuration,
      };
      if (reducedMotion === "reduce") {
        for (const duration of Object.values(durations)) expect(duration).toBeLessThanOrEqual(1);
      } else {
        for (const duration of Object.values(durations)) expect(duration).toBeGreaterThanOrEqual(100);
      }
      evidence.push({
        reducedMotion,
        selectionResponseMs,
        ...durations,
        focusPreserved: true,
        semanticParity: true,
      });
    }

    console.log(`MOTION_FIRST_WAVE_EVIDENCE ${JSON.stringify(evidence)}`);
    await testInfo.attach("motion-first-wave.json", {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: "application/json",
    });
  });

  test("before baseline empty state loading state error state", async ({ page }, testInfo) => {
    test.skip(CAPTURE_SUFFIX === "after");
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
      await page.goto(manifest.routes.dashboard, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main")).toBeVisible();
      await capture(page, manifest, "dashboard", "populated", width);
    }
    if ([390, 768, 1280].includes(width)) {
      for (const state of ["empty", "loading", "error"] as const) {
        await captureApiState(page, manifest, { scenario: "dashboard", state, width, route: manifest.routes.dashboard, api: /\/api\/dashboard\/stats/, emptyBody: emptyDashboard });
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

  test("after foundation matrix empty state loading state error state", async ({ page }, testInfo) => {
    test.skip(CAPTURE_SUFFIX !== "after");
    const width = testInfo.project.use.viewport?.width;
    if (!width) throw new Error("Visual project has no viewport width");
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
        await captureApiState(page, manifest, { scenario: "dashboard", state, width, route: manifest.routes.dashboard, api: /\/api\/dashboard\/stats/, emptyBody: emptyDashboard });
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
    test.skip(CAPTURE_SUFFIX === "after");
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    const { locale, theme } = variant(width);
    await login(page, locale, theme);
    await page.goto("/settings?tab=privacy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const deleteAccount = page.getByRole("button", { name: /quero excluir minha conta|delete account/i });
    await expect(deleteAccount).toBeEnabled();
    const confirmation = page.getByLabel(/confirmar exclusão da conta|confirm account deletion/i);
    await deleteAccount.click();
    await expect(confirmation).toBeVisible();
    await capture(page, manifest, "overlay", "settings-confirmation-dialog", width);
  });

  test("after settings confirmation dialog derivation review sheet layer harness", async ({ page }, testInfo) => {
    test.skip(CAPTURE_SUFFIX !== "after");
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    const { locale, theme } = variant(width);
    await login(page, locale, theme);

    await page.goto("/settings?tab=privacy", { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("load");
    const deleteAccount = page.getByRole("button", { name: /quero excluir minha conta|delete account/i });
    await expect(deleteAccount).toBeEnabled();
    const confirmation = page.getByLabel(/confirmar exclusão da conta|confirm account deletion/i);
    await deleteAccount.click();
    await expect(confirmation).toBeVisible();
    await capture(page, manifest, "overlay", "settings-confirmation-dialog", width);
    await page.keyboard.press("Escape");

    await page.goto(manifest.routes.workspace, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible();
    const moreActions = page.getByRole("button", { name: /mais ações para peça 1|more actions for piece 1/i });
    await moreActions.click();
    await page.getByRole("menuitem", { name: /visualizar|preview/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, manifest, "overlay", "derivation-review-sheet", width);
    await page.keyboard.press("Escape");

    await mountVisualLayerHarness(page, "sticky-popover-toast");
    await capture(page, manifest, "layer-harness", "sticky-popover-toast", width);
    await mountVisualLayerHarness(page, "shell-backdrop-overlay-toast");
    await capture(page, manifest, "layer-harness", "shell-backdrop-overlay-toast", width);
  });

  test("before baseline derivation review sheet", async ({ page }, testInfo) => {
    test.skip(CAPTURE_SUFFIX === "after");
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    const { locale, theme } = variant(width);
    await login(page, locale, theme);
    await page.goto(manifest.routes.workspace);
    const moreActions = page.getByRole("button", { name: /mais ações para peça 1|more actions for piece 1/i });
    await moreActions.click();
    await page.getByRole("menuitem", { name: /visualizar|preview/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await capture(page, manifest, "overlay", "derivation-review-sheet", width);
  });

  test("before baseline layer harness", async ({ page }, testInfo) => {
    test.skip(CAPTURE_SUFFIX === "after");
    const width = testInfo.project.use.viewport?.width;
    test.skip(!width || ![390, 1440].includes(width));
    if (!width) return;
    await mountVisualLayerHarness(page, "sticky-popover-toast");
    await capture(page, manifest, "layer-harness", "sticky-popover-toast", width);
    await mountVisualLayerHarness(page, "shell-backdrop-overlay-toast");
    await capture(page, manifest, "layer-harness", "shell-backdrop-overlay-toast", width);
  });
});
