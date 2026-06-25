import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";

const BASE_URL = "http://localhost:3001";
const OUT_DIR = path.resolve(
  "/Users/jhonatan/Library/Application Support/Open Design/namespaces/release-stable/data/projects/7794dd2d-fba4-47cc-82e3-b535a3af6cbb/screenshots",
);
const MANIFEST_PATH = path.join(OUT_DIR, "manifest.json");

const EMAIL = "dev-admin@adscale.local";
const PASSWORD = "DevAdmin123!";

interface Capture {
  name: string;
  route: string;
  file: string;
  status: "ok" | "skipped" | "error";
  note?: string;
}

const results: Capture[] = [];

function slug(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function preparePage(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "pt-BR", domain: "localhost", path: "/" },
    { name: "cookie-consent", value: "accepted", domain: "localhost", path: "/" },
  ]);
  await page.addInitScript(() => {
    localStorage.setItem("theme", "light");
    const style = document.createElement("style");
    style.textContent =
      "*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}";
    document.documentElement.appendChild(style);
  });
}

async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const loginError = await page.evaluate(async ({ loginEmail, loginPassword }) => {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    if (!response.ok) return await response.text();
    window.location.assign("/");
    return null;
  }, { loginEmail: EMAIL, loginPassword: PASSWORD });

  if (loginError) throw new Error(`Login failed: ${loginError}`);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 });
  await page.waitForLoadState("domcontentloaded");
}

async function captureRoute(
  page: Page,
  name: string,
  route: string,
  options?: { waitMs?: number; fullPage?: boolean; subTab?: string },
) {
  const fileName = `${slug(name)}.png`;
  const filePath = path.join(OUT_DIR, fileName);
  try {
    await page.goto(`${BASE_URL}${route}`, {
      waitUntil: "domcontentloaded",
      timeout: 120_000,
    });
    if (options?.subTab) {
      await page.evaluate((tab) => {
        const link = document.querySelector(`a[href*="${tab}"]`) as HTMLAnchorElement | null;
        link?.click();
      }, options.subTab);
      await page.waitForTimeout(1200);
    }
    await page.waitForTimeout(options?.waitMs ?? 1200);
    await page.screenshot({
      path: filePath,
      fullPage: options?.fullPage ?? true,
      animations: "disabled",
    });
    results.push({ name, route, file: fileName, status: "ok" });
    console.log(`✓ ${name} (${route})`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    results.push({ name, route, file: fileName, status: "error", note: msg });
    console.log(`✗ ${name} (${route}) — ${msg.slice(0, 120)}`);
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  await preparePage(page);

  console.log("Logging in...");
  await login(page);
  console.log("Login OK");

  const targets: Array<{ name: string; route: string; opts?: Parameters<typeof captureRoute>[3] }> = [
    { name: "01-home", route: "/" },
    { name: "02-campaigns", route: "/campaigns" },
    { name: "03-campaign-detail", route: "/campaigns" }, // will click first card
    { name: "04-library", route: "/library" },
    { name: "05-templates", route: "/templates" },
    { name: "06-restyling-wizard", route: "/restyling" },
    { name: "07-quick-tools-restyling", route: "/quick-tools/restyling" },
    { name: "08-feedback", route: "/feedback" },
    { name: "09-settings-profile", route: "/settings" },
    { name: "10-settings-workspace", route: "/settings", opts: { subTab: "workspace" } },
    { name: "11-settings-team", route: "/settings", opts: { subTab: "team" } },
    { name: "12-settings-brand-kit", route: "/settings", opts: { subTab: "brand" } },
    { name: "13-settings-billing", route: "/settings", opts: { subTab: "billing" } },
    { name: "14-settings-integrations", route: "/settings", opts: { subTab: "integrations" } },
  ];

  for (const t of targets) {
    if (t.name === "03-campaign-detail") {
      // Visit /campaigns and click first card
      try {
        await page.goto(`${BASE_URL}/campaigns`, { waitUntil: "domcontentloaded", timeout: 120_000 });
        await page.waitForTimeout(1200);
        const firstCardHref = await page.evaluate(() => {
          const a = document.querySelector(
            'a[href^="/campaigns/"]:not([href="/campaigns/new"]):not([href="/campaigns"])',
          ) as HTMLAnchorElement | null;
          return a?.getAttribute("href") ?? null;
        });
        if (firstCardHref) {
          await captureRoute(page, "03-campaign-detail", firstCardHref, { fullPage: true });
        } else {
          results.push({
            name: "03-campaign-detail",
            route: "(no card found)",
            file: "",
            status: "skipped",
            note: "no campaign card link on /campaigns",
          });
          console.log("⚠ 03-campaign-detail — no card link");
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        results.push({ name: "03-campaign-detail", route: "(error)", file: "", status: "error", note: msg });
      }
      continue;
    }
    await captureRoute(page, t.name, t.route, t.opts);
  }

  writeFileSync(
    MANIFEST_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );
  console.log(`\nManifest: ${MANIFEST_PATH}`);
  console.log(`Captured: ${results.filter((r) => r.status === "ok").length}/${results.length}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});