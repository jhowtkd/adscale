import "./load-env";

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Page } from "@playwright/test";
import { db } from "../src/server/db";
import { clientProfiles } from "../src/server/db/schema";

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

async function main() {
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
