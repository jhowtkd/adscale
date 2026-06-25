// Capture screenshots of the 10 refactored dashboard routes for visual evidence.
// Uses the global playwright install + the pre-seeded visual-foundations user.
import { chromium } from "/Users/jhonatan/.local/share/fnm/node-versions/v24.3.0/installation/lib/node_modules/playwright/index.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_URL = "http://localhost:3001";
const OUT_DIR = "/Users/jhonatan/Library/Application Support/Open Design/namespaces/release-stable/data/projects/7794dd2d-fba4-47cc-82e3-b535a3af6cbb/screenshots/refactor-visual";
const EMAIL = "visual-foundations@example.test";
const PASSWORD = "VisualFoundations123!";

// Routes in capture order. Settings tabs that are disabled in settings-tabs.ts
// (profile, workspace, integrations) are excluded — they fall back to the
// first enabled tab (brandKit). The 6 user-listed tabs become 3 enabled:
// team, brandKit, billing — plus 2 more accessible (plans, creditHistory).
// Campaign detail ID is resolved at runtime from the campaigns list.
const CAMPAIGN_DETAIL_FALLBACK = "/campaigns/2b81ccb5-6253-4e73-8fba-4e39c9c429f1";
const ROUTES = [
  { name: "01-home", route: "/", label: "Home — PoC refactor" },
  { name: "02-campaigns-list", route: "/campaigns", label: "Campanhas — lista" },
  { name: "03-campaigns-detail", route: null, label: "Campanha — detail" }, // resolved dynamically
  { name: "04-library", route: "/library", label: "Library" },
  { name: "05-templates", route: "/templates", label: "Templates" },
  { name: "06-restyling", route: "/restyling", label: "Restyling wizard" },
  { name: "07-quick-tools-restyling", route: "/quick-tools/restyling", label: "Quick tools · restyling" },
  { name: "08-feedback", route: "/feedback", label: "Feedback" },
  { name: "09-settings-team", route: "/settings?tab=team", label: "Settings · Equipe" },
  { name: "10-settings-brandKit", route: "/settings?tab=brandKit", label: "Settings · Brand kit" },
  { name: "11-settings-billing", route: "/settings?tab=billing", label: "Settings · Faturamento" },
  { name: "12-settings-plans", route: "/settings?tab=plans", label: "Settings · Planos" },
  { name: "13-settings-creditHistory", route: "/settings?tab=creditHistory", label: "Settings · Histórico de créditos" },
  { name: "14-settings-privacy", route: "/settings?tab=privacy", label: "Settings · Privacidade" },
];

async function preparePage(page) {
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.setViewportSize({ width: 1440, height: 900 });
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

async function login(page) {
  // First navigate so the fetch has a base URL
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const loginError = await page.evaluate(async ({ email, password }) => {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) return await response.text();
    return null;
  }, { email: EMAIL, password: PASSWORD });

  if (loginError) throw new Error(`Login failed: ${loginError}`);

  await page.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("domcontentloaded");
}

async function findCampaignId(page) {
  // The campaigns list uses a dynamic CampaignsListView component that hydrates
  // after mount. Use domcontentloaded (networkidle can hang on dev-server websockets)
  // + extra render time so links exist.
  await page.goto(`${BASE_URL}/campaigns`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(8000);
  const href = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href*="/campaigns/"]'));
    const filtered = links
      .map((a) => a.getAttribute("href"))
      .filter((h) => h && !["/campaigns", "/campaigns/new"].includes(h) && h.match(/^\/campaigns\/[0-9a-f-]{8}/i));
    return filtered[0] ?? null;
  });
  if (!href) return CAMPAIGN_DETAIL_FALLBACK;
  return href.split("?")[0].split("#")[0];
}

async function capture(page, routeEntry) {
  const { name, route, label } = routeEntry;
  const target = route ?? routeEntry._resolved;
  if (!target) {
    return { name, route: "—", label, status: "skipped", note: "no route resolved" };
  }
  try {
    await page.goto(`${BASE_URL}${target}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(2000);
    const filePath = resolve(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: filePath, fullPage: true, animations: "disabled" });
    return { name, route: target, label, file: `refactor-visual/${name}.png`, status: "ok" };
  } catch (err) {
    return {
      name,
      route: target,
      label,
      status: "error",
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await preparePage(page);
  await login(page);

  // Resolve the campaign detail route (falls back to a known good ID)
  const detailPath = await findCampaignId(page);
  const detailEntry = ROUTES.find((r) => r.name === "03-campaigns-detail");
  if (detailEntry) detailEntry._resolved = detailPath;

  const results = [];
  for (const r of ROUTES) {
    const out = await capture(page, r);
    results.push(out);
    console.log(`${out.status === "ok" ? "✓" : out.status === "skipped" ? "–" : "✗"} ${r.name}  ${r.route ?? "—"}`);
    if (out.note) console.log(`   ${out.note}`);
  }

  await browser.close();

  const indexPath = resolve(OUT_DIR, "manifest.json");
  writeFileSync(
    indexPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        branch: "refactor/visual-dashboard",
        baseUrl: BASE_URL,
        viewport: { width: 1440, height: 900 },
        results,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`\nManifest: ${indexPath}`);

  const ok = results.filter((r) => r.status === "ok").length;
  const err = results.filter((r) => r.status === "error").length;
  const skip = results.filter((r) => r.status === "skipped").length;
  console.log(`Done: ${ok} ok · ${err} errors · ${skip} skipped`);
  if (err > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
