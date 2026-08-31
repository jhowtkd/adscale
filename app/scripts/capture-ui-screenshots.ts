import "./load-env";

import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { db } from "../src/server/db";
import { clientProfiles } from "../src/server/db/schema";
import {
  COMMERCIAL_STUDY_DISCLAIMER,
  assertCaptureOutputPath,
  loadCommercialStudiesManifest,
  ownedProfileName,
  resolveCommercialCaptures,
  type ResolvedCapture,
  type ResolvedCommercialStudies,
} from "./lib/commercial-studies";
import {
  assertClientCaptureOutputPath,
  clientCaseProfileName,
  loadClientCasesManifest,
  resolveClientCaptures,
  type ClientCasesManifest,
  type ClientResolvedCapture,
} from "./lib/client-cases";

type CaptureMode = "commercial-studies" | "client-cases";

const BASE_URL = (process.env.E2E_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const OUT_DIR = path.resolve(process.cwd(), "../docs/screenshots/app");
const MANIFEST_PATH = path.resolve(process.cwd(), "test-results/visual-foundations/manifest.json");
const TESTSPRITE_SEED = path.resolve(process.cwd(), "../testsprite_tests/testsprite-seed.json");

const VISUAL_EMAIL = "visual-foundations@example.test";
const VISUAL_PASSWORD = process.env.VISUAL_FOUNDATIONS_PASSWORD ?? "VisualFoundations123!";

type CaptureResult = {
  name: string;
  route: string;
  file: string;
  status: "ok" | "skipped" | "error";
  note?: string;
};

const results: CaptureResult[] = [];

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

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  const loginError = await page.evaluate(async ({ loginEmail, loginPassword }) => {
    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: loginPassword }),
    });
    if (!response.ok) {
      return await response.text();
    }
    window.location.assign("/");
    return null;
  }, { loginEmail: email, loginPassword: password });

  if (loginError) {
    throw new Error(`Login failed for ${email}: ${loginError}`);
  }

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 120_000 });
  await page.waitForLoadState("domcontentloaded");
}

async function captureRoute(
  page: Page,
  name: string,
  route: string,
  options?: { waitMs?: number; fullPage?: boolean },
) {
  const fileName = `${slug(name)}.png`;
  const filePath = path.join(OUT_DIR, fileName);
  try {
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(options?.waitMs ?? 800);
    await page.screenshot({ path: filePath, fullPage: options?.fullPage ?? true, animations: "disabled" });
    results.push({
      name,
      route,
      file: path.relative(path.resolve(process.cwd(), ".."), filePath).replaceAll("\\", "/"),
      status: "ok",
    });
  } catch (error) {
    results.push({
      name,
      route,
      file: filePath,
      status: "error",
      note: error instanceof Error ? error.message : String(error),
    });
  }
}

type CommercialCaptureResult = {
  id: string;
  brand: string;
  stage: string;
  route: string;
  viewport: { width: number; height: number };
  output: string;
  status: "ok" | "skipped" | "error";
  note?: string;
};

const commercialResults: CommercialCaptureResult[] = [];

function commercialPaths(mode: CaptureMode) {
  const repoRoot = path.resolve(process.cwd(), "..");
  const root =
    mode === "client-cases"
      ? path.join(repoRoot, "docs/client-cases")
      : path.join(repoRoot, "docs/commercial-studies/real-brands");
  return {
    repoRoot,
    root,
    sourceManifest: path.join(root, "manifest.json"),
    resolvedManifest: path.join(root, "evidence/resolved-manifest.json"),
    indexPath: path.join(root, "screenshots/INDEX.json"),
  };
}

function writeCommercialIndex(extra?: { fatalError?: string }) {
  const { indexPath } = commercialPaths(currentMode);
  mkdirSync(path.dirname(indexPath), { recursive: true });
  writeFileSync(
    indexPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        results: commercialResults,
        ...extra,
      },
      null,
      2,
    )}\n`,
  );
}

let currentMode: CaptureMode = "commercial-studies";

type AnyResolvedCapture = ResolvedCapture | ClientResolvedCapture;

async function injectCaptureOverlays(
  page: Page,
  capture: AnyResolvedCapture,
  study: { campaign: string; hypothesis: string; sources: Array<{ title: string }> },
  mode: CaptureMode,
) {
  await page.evaluate(
    ({ showStudyChrome, stage, campaign, hypothesis, sourceTitle, disclaimer }) => {
      const captureCss = document.createElement("style");
      captureCss.setAttribute("data-commercial-study-capture-css", "");
      captureCss.textContent = "nextjs-portal{display:none!important}";
      document.head.appendChild(captureCss);
      if (!showStudyChrome) return;
      const footer = document.createElement("footer");
      footer.setAttribute("data-commercial-study-disclaimer", "");
      footer.textContent = disclaimer;
      footer.style.cssText =
        "position:fixed;bottom:0;left:0;right:0;z-index:2147483647;background:#111;color:#fff;padding:8px 12px;font:12px/1.4 sans-serif;pointer-events:none";
      document.body.appendChild(footer);
      if (stage === "context") {
        const header = document.createElement("header");
        header.setAttribute("data-commercial-study-context", "");
        header.style.cssText =
          "position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#111;color:#fff;padding:8px 12px;font:12px/1.4 sans-serif;pointer-events:none;white-space:pre-wrap";
        header.textContent = [campaign, hypothesis, sourceTitle, disclaimer].join("\n");
        document.body.appendChild(header);
      }
    },
    {
      showStudyChrome: mode === "commercial-studies",
      stage: capture.stage,
      campaign: study.campaign,
      hypothesis: study.hypothesis,
      sourceTitle: study.sources?.[0]?.title ?? "",
      disclaimer: COMMERCIAL_STUDY_DISCLAIMER,
    },
  );
}

function readDirSafe(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

const ACTIVE_BRAND_SWITCHER_NAME = "Marca ativa";
const COOKIE_BANNER_ACCEPT_NECESSARY_NAME = "Apenas necessarios";
const ADSCALE_COOKIE_CONSENT_KEY = "adscale_cookie_consent";

async function dismissCookieBanner(page: Page) {
  const hasStoredConsent = await page.evaluate(
    (key) => localStorage.getItem(key) !== null,
    ADSCALE_COOKIE_CONSENT_KEY,
  );
  if (hasStoredConsent) return;
  await page
    .getByRole("button", { name: COOKIE_BANNER_ACCEPT_NECESSARY_NAME })
    .first()
    .click({ timeout: 2_000 })
    .catch(() => undefined);
}

async function ensureActiveBrandSelected(
  page: Page,
  brand: string,
  clientProfileId: string,
  mode: CaptureMode,
) {
  const switcher = page.getByRole("combobox", { name: ACTIVE_BRAND_SWITCHER_NAME }).first();
  try {
    await switcher.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return;
  }
  if ((await switcher.inputValue()) === clientProfileId) {
    return;
  }
  const label = mode === "client-cases" ? clientCaseProfileName(brand as never) : ownedProfileName(brand as never);
  await switcher.selectOption({ label });
  if ((await switcher.inputValue()) !== clientProfileId) {
    throw new Error(`could not activate brand profile for ${brand}`);
  }
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
}

async function captureCommercialStudies(mode: CaptureMode) {
  const { sourceManifest, resolvedManifest, repoRoot } = commercialPaths(mode);
  const captures: AnyResolvedCapture[] = [];
  let sourceStudies: Array<Record<string, unknown>> = [];
  let runtime: Record<string, { clientProfileId: string }> | ResolvedCommercialStudies;
  if (mode === "client-cases") {
    const manifest = loadClientCasesManifest(sourceManifest);
    runtime = JSON.parse(readFileSync(resolvedManifest, "utf8"));
    captures.push(...resolveClientCaptures(manifest, runtime as never));
    sourceStudies = manifest.studies as unknown as Array<Record<string, unknown>>;
  } else {
    const manifest = loadCommercialStudiesManifest(sourceManifest);
    runtime = JSON.parse(readFileSync(resolvedManifest, "utf8")) as ResolvedCommercialStudies;
    captures.push(...resolveCommercialCaptures(manifest, runtime));
    sourceStudies = manifest.studies as unknown as Array<Record<string, unknown>>;
  }
  const email = process.env.COMMERCIAL_STUDIES_EMAIL ?? "";
  const password = process.env.COMMERCIAL_STUDIES_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("COMMERCIAL_STUDIES_EMAIL and COMMERCIAL_STUDIES_PASSWORD are required");
  }

  const browser = await chromium.launch({ headless: true });
  const authContext = await browser.newContext();
  const page = await authContext.newPage();
  await preparePage(page);
  await login(page, email, password);

  if (mode === "client-cases") {
    const { root } = commercialPaths(mode);
    const resultsDir = path.join(root, "results");
    await page.route("**/r2.dev/**", async (route) => {
      const raw = route.request().url();
      const target = raw.includes("/_next/image")
        ? new URL(raw).searchParams.get("url") ?? ""
        : raw;
      const withoutHost = target.replace(/^https:\/\/[^/]+\//, "");
      const parts = decodeURIComponent(withoutHost).split("/");
      if (parts[0] === "client-cases" && parts.length === 4) {
        try {
          const buffer = readFileSync(path.join(root, "originals", parts[2], parts[3]));
          await route.fulfill({ status: 200, contentType: "image/jpeg", body: buffer });
          return;
        } catch {
          // fall through to network
        }
      }
      if (parts[0] === "creative-work") {
        const outputId = parts[1] ?? "";
        const local = path.join(resultsDir, `${outputId}.png`);
        for (const candidate of existsSync(resultsDir) ? [] : []) void candidate;
        const files = existsSync(resultsDir) ? readDirSafe(resultsDir) : [];
        const match = files.find((f) => f.endsWith(`-${outputId.slice(0, 8)}.png`) || f.includes(outputId.slice(0, 8)));
        if (match) {
          try {
            const buffer = readFileSync(path.join(resultsDir, match));
            await route.fulfill({ status: 200, contentType: "image/png", body: buffer });
            return;
          } catch {
            // fall through to network
          }
        }
        void local;
      }
      await route.continue();
    });
  }

  for (const capture of captures) {
    const filePath =
      mode === "client-cases"
        ? assertClientCaptureOutputPath(capture.output, commercialPaths(mode).root + "/screenshots")
        : assertCaptureOutputPath(capture.output);
    const output = path.relative(repoRoot, filePath).replaceAll("\\", "/");
    try {
      const study = runtime.studies[capture.brand];
      const sourceStudy = sourceStudies.find((item) => item.slug === capture.brand);
      if (!sourceStudy) {
        throw new Error(`missing source study ${capture.brand}`);
      }
      await page.setViewportSize(capture.viewport);
      await page.evaluate(
        (payload) => {
          localStorage.setItem("adscale-storage", JSON.stringify(payload));
        },
        {
          state: {
            activeClientProfileId: study.clientProfileId,
            sidebarCollapsed: false,
          },
          version: 0,
        },
      );
      await page.goto(`${BASE_URL}${capture.route}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await ensureActiveBrandSelected(page, capture.brand, study.clientProfileId, mode);
      await dismissCookieBanner(page);
      await page.waitForSelector(capture.waitFor, { timeout: 120_000 });
      await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
      await page.evaluate(() => document.fonts.ready);
      if (capture.route === "/library") {
        await page
          .waitForFunction(
            () => document.body.innerText.includes("Resultado gerado"),
            { timeout: 60_000, polling: 500 },
          )
          .catch(() => undefined);
      }
      await page
        .waitForFunction(
          () => Array.from(document.images).every((img) => img.complete && img.naturalWidth > 0),
          { timeout: 45_000, polling: 700 },
        )
        .catch(() => undefined);
      await injectCaptureOverlays(page, capture, sourceStudy as never, mode);
      if (capture.stage === "training") {
        const assetList = (sourceStudy.assets ?? sourceStudy.originals) as Array<{ id: string }> | undefined;
        const assetsSelector = (assetList ?? [])
          .map((original) => `img[alt="${original.id}"]`)
          .join(", ");
        const assetCount = assetsSelector ? await page.locator(assetsSelector).count() : 0;
        if (assetCount === 0) {
          throw new Error(`training capture has no original assets: ${assetsSelector}`);
        }
        const firstOriginalId = (assetList ?? [])[0]?.id;
        if (firstOriginalId) {
          const selector = `img[alt="${firstOriginalId}"]`;
          await page.locator(selector).first().scrollIntoViewIfNeeded();
          await page
            .waitForFunction(
              (sel) => {
                const img = document.querySelector(sel);
                if (!img) return false;
                if (!img.complete || img.naturalWidth === 0) {
                  const src = img.getAttribute("src");
                  if (src) img.setAttribute("src", src);
                }
                return img.complete && img.naturalWidth > 0;
              },
              selector,
              { timeout: 30_000, polling: 500 },
            )
            .catch(() => undefined);
        }
      }
      mkdirSync(path.dirname(filePath), { recursive: true });
      await page.screenshot({ path: filePath, animations: "disabled" });
      commercialResults.push({
        id: capture.id,
        brand: capture.brand,
        stage: capture.stage,
        route: capture.route,
        viewport: capture.viewport,
        output,
        status: "ok",
      });
    } catch (error) {
      commercialResults.push({
        id: capture.id,
        brand: capture.brand,
        stage: capture.stage,
        route: capture.route,
        viewport: capture.viewport,
        output,
        status: "error",
        note: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await authContext.close();
  await browser.close();
  writeCommercialIndex();

  const ok = commercialResults.filter((item) => item.status === "ok").length;
  const skipped = commercialResults.filter((item) => item.status === "skipped").length;
  const errors = commercialResults.filter((item) => item.status === "error").length;
  console.log(`Captured ${ok} screenshots (${skipped} skipped, ${errors} errors)`);
  console.log(`Summary: ${commercialPaths(mode).indexPath}`);
  if (errors > 0 || skipped > 0 || commercialResults.length !== 24) {
    process.exitCode = 1;
  }
}

async function main() {
  if (process.argv.includes("--client-cases")) {
    currentMode = "client-cases";
    await captureCommercialStudies("client-cases");
    return;
  }

  if (process.argv.includes("--commercial-studies")) {
    await captureCommercialStudies("commercial-studies");
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
    routes: Record<string, string>;
    fixtureIds: { campaignIds: string[] };
  };
  const testsprite = JSON.parse(readFileSync(TESTSPRITE_SEED, "utf8")) as {
    shareUrl: string;
    inviteUrl: string;
    resetTokenEndpoint: string;
    resetUser: { email: string };
  };

  const browser = await chromium.launch({ headless: true });

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await preparePage(publicPage);

  const publicRoutes: Array<{ name: string; route: string }> = [
    { name: "Login", route: "/login" },
    { name: "Signup", route: "/signup" },
    { name: "Forgot Password", route: "/forgot-password" },
    { name: "Privacy Policy", route: "/privacy" },
    { name: "Terms of Service", route: "/terms" },
    { name: "Invite (no token)", route: "/invite" },
    { name: "Reset Password (no token)", route: "/reset-password" },
  ];

  for (const entry of publicRoutes) {
    await captureRoute(publicPage, entry.name, entry.route);
  }

  const inviteUrl = new URL(testsprite.inviteUrl);
  await captureRoute(publicPage, "Invite (with token)", `${inviteUrl.pathname}${inviteUrl.search}`);

  try {
    const resetEndpoint = testsprite.resetTokenEndpoint.replace(
      "<email>",
      encodeURIComponent(testsprite.resetUser.email),
    );
    const resetResponse = await fetch(resetEndpoint);
    if (resetResponse.ok) {
      const resetData = (await resetResponse.json()) as { resetPageUrl?: string };
      if (resetData.resetPageUrl) {
        const resetUrl = new URL(resetData.resetPageUrl);
        await captureRoute(
          publicPage,
          "Reset Password (with token)",
          `${resetUrl.pathname}${resetUrl.search}`,
        );
      } else {
        results.push({
          name: "Reset Password (with token)",
          route: "/reset-password?token=…",
          file: "",
          status: "skipped",
          note: "reset-token endpoint returned no resetPageUrl",
        });
      }
    } else {
      results.push({
        name: "Reset Password (with token)",
        route: "/reset-password?token=…",
        file: "",
        status: "skipped",
        note: `reset-token endpoint failed (${resetResponse.status})`,
      });
    }
  } catch (error) {
    results.push({
      name: "Reset Password (with token)",
      route: "/reset-password?token=…",
      file: "",
      status: "skipped",
      note: error instanceof Error ? error.message : String(error),
    });
  }

  const shareUrl = new URL(testsprite.shareUrl);
  await captureRoute(publicPage, "Share Gallery", `${shareUrl.pathname}`);
  await publicContext.close();

  const authContext = await browser.newContext();
  const page = await authContext.newPage();
  await preparePage(page);
  await login(page, VISUAL_EMAIL, VISUAL_PASSWORD);

  const authenticatedRoutes: Array<{ name: string; route: string }> = [
    { name: "Dashboard", route: manifest.routes.dashboard },
    { name: "Campaigns List", route: manifest.routes.campaignList },
    { name: "Campaign Workspace", route: manifest.routes.workspace },
    { name: "Library", route: "/library" },
    { name: "Templates", route: "/templates" },
    { name: "Restyling", route: "/restyling" },
    { name: "Quick Tools Restyling", route: "/quick-tools/restyling" },
    { name: "Feedback", route: "/feedback" },
    { name: "Settings — Brand Kit", route: "/settings?tab=brandKit" },
    { name: "Settings — Team", route: "/settings?tab=team" },
    { name: "Settings — Billing", route: "/settings?tab=billing" },
    { name: "Settings — Credit History", route: "/settings?tab=creditHistory" },
    { name: "Settings — Plans", route: "/settings?tab=plans" },
    { name: "Settings — Privacy", route: "/settings?tab=privacy" },
  ];

  for (const entry of authenticatedRoutes) {
    await captureRoute(page, entry.name, entry.route);
  }

  const profiles = await db.select({ id: clientProfiles.id }).from(clientProfiles).limit(1);
  if (profiles[0]) {
    await captureRoute(
      page,
      "Admin — Owner Calibration Panel",
      `/admin/quality/brands/${profiles[0].id}`,
      { waitMs: 1200 },
    );
  } else {
    results.push({
      name: "Admin — Owner Calibration Panel",
      route: "/admin/quality/brands/:clientProfileId",
      file: "",
      status: "skipped",
      note: "No client profile found in database",
    });
  }

  await authContext.close();
  await browser.close();

  const summaryPath = path.resolve(process.cwd(), "../docs/screenshots/INDEX.json");
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        viewport: { width: 1280, height: 900 },
        results,
      },
      null,
      2,
    )}\n`,
  );

  const ok = results.filter((item) => item.status === "ok").length;
  const skipped = results.filter((item) => item.status === "skipped").length;
  const errors = results.filter((item) => item.status === "error").length;
  console.log(`Captured ${ok} screenshots (${skipped} skipped, ${errors} errors)`);
  console.log(`Summary: ${summaryPath}`);
  if (errors > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  if (process.argv.includes("--commercial-studies") || process.argv.includes("--client-cases")) {
    writeCommercialIndex({
      fatalError: error instanceof Error ? error.message : String(error),
    });
    process.exit(1);
    return;
  }
  const summaryPath = path.resolve(process.cwd(), "../docs/screenshots/INDEX.json");
  writeFileSync(
    summaryPath,
    `${JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        viewport: { width: 1280, height: 900 },
        results,
        fatalError: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exit(1);
});
