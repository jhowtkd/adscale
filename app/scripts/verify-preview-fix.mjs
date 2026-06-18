import { chromium } from "playwright";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const BASE_URL = process.env.E2E_BASE_URL ?? "https://adscale.jhonatansoares.com";
const AUTH_STATE = process.env.E2E_AUTH_STATE ?? "/tmp/adscale-auth.json";
const OUT_DIR = process.env.E2E_OUT_DIR ?? "/tmp/preview-fix-verify";

mkdirSync(OUT_DIR, { recursive: true });

const DERIVE_LABEL = /^(Derive|Derivar)$/i;
const GENERATE_PREVIEW = /Generate preview|Gerar prévia/i;
const PROGRESS_RE = /(\d+)%/;

async function login(page, context) {
  const email = process.env.E2E_EMAIL;
  const password = process.env.E2E_PASSWORD;
  if (!email || !password) throw new Error("E2E_EMAIL/E2E_PASSWORD required");
  await page.goto(`${BASE_URL}/login`);
  await page.locator("#email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.locator("form:has(#email) button[type=submit]").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 60_000,
    waitUntil: "domcontentloaded",
  });
  await context.storageState({ path: AUTH_STATE });
}

async function readProgress(page) {
  const el = page.locator("span").filter({ hasText: PROGRESS_RE }).first();
  if (!(await el.count())) return null;
  const match = (await el.textContent())?.match(PROGRESS_RE);
  return match ? Number(match[1]) : null;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: existsSync(AUTH_STATE) ? AUTH_STATE : undefined,
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const evidence = { baseUrl: BASE_URL, runAt: new Date().toISOString(), samples: [] };

try {
  await page.goto(`${BASE_URL}/campaigns`, { waitUntil: "domcontentloaded" });
  if (page.url().includes("/login")) await login(page, context);

  const listRes = await page.request.get(`${BASE_URL}/api/campaigns`);
  const campaigns = (await listRes.json()).campaigns ?? [];
  const pick =
    campaigns.find((c) => c.name?.includes("Teste campanha")) ??
    campaigns.find((c) => c.ctaVariants?.length);
  if (!pick?.id) throw new Error("No suitable campaign");

  evidence.campaignId = pick.id;
  await page.goto(`${BASE_URL}/campaigns/${pick.id}`, { waitUntil: "domcontentloaded" });

  const deriveBtn = page.getByRole("button", { name: DERIVE_LABEL }).first();
  await deriveBtn.waitFor({ state: "visible", timeout: 30_000 });
  await deriveBtn.click();
  const previewBtn = page.getByRole("button", { name: GENERATE_PREVIEW });
  await previewBtn.waitFor({ state: "visible", timeout: 30_000 });
  await page.waitForTimeout(1500);
  await previewBtn.click();

  for (const delayMs of [0, 800, 2000, 5000, 10000]) {
    if (delayMs) await page.waitForTimeout(delayMs);
    const uiProgress = await readProgress(page);
    evidence.samples.push({ tMs: delayMs, uiProgress });
    if (delayMs >= 5000 && uiProgress != null && uiProgress !== 52) break;
  }

  const values = evidence.samples.map((s) => s.uiProgress).filter((v) => v != null);
  evidence.conclusion = {
    fixDeployed: values.length > 0 && !values.every((v) => v === 52),
    animated: values.length >= 2 && values[0] !== values[values.length - 1],
    startsAtEight: values[0] === 8,
    progressSeries: values,
  };

  writeFileSync(path.join(OUT_DIR, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} catch (error) {
  evidence.error = error instanceof Error ? error.message : String(error);
  writeFileSync(path.join(OUT_DIR, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.error(evidence.error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
