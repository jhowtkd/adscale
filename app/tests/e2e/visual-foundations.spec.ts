import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { mountVisualLayerHarness } from "./support/visual-layer-harness";

const EMAIL = "visual-foundations@example.test";
const PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";
const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");
const SCREENSHOT_DIR = path.resolve(process.cwd(), "../.planning/phases/109-visual-foundations-and-baseline/evidence");
const REQUIRED_MASKS = ["email", "user", "workspace", "client", "campaign-id", "timestamp", "generated-image"];

type Manifest = {
  identity: { email: string; name: string };
  fixtureIds: { userId: string; workspaceId: string; campaignIds: string[] };
  labels: { workspace: string; clients: string[] };
  routes: Record<string, string>;
  states: Record<string, string[]>;
};

function seed(): Manifest {
  if (!existsSync(MANIFEST_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-visual-foundations.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, E2E_BASE_URL: process.env.E2E_BASE_URL ?? "http://localhost:3000" },
      stdio: "inherit",
    });
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as Manifest;
}

async function login(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "pt-BR", domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    const style = document.createElement("style");
    style.dataset.visualFoundations = "deterministic-motion";
    style.textContent = "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  });
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

    await login(page);
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
});
