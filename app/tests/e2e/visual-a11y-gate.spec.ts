import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginVisualFoundation, seedVisualManifest, type VisualManifest } from "./support/visual-auth";

const axePath = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");
const EVIDENCE_PATH = path.resolve(process.cwd(), "../.planning/phases/114-visual-regression-and-release-gate/114-EVIDENCE.json");

type A11yCheck = {
  key: string;
  route: string;
  viewport: number;
  browser: "chromium" | "webkit";
  violations: number;
  incomplete: number;
  indeterminateIncomplete: number;
  blockingIncomplete: number;
  result: "pass" | "fail";
};

type InteractionCheck = {
  key: string;
  route: string;
  viewport: number;
  browser: "chromium" | "webkit";
  mainCount: number;
  skipLinkCount: number;
  invalidLabelledBy: string[];
  focusOrder: boolean;
  accessibleControls: boolean;
  textResizeOverflowX: number;
  lowHeightOverflowX: number;
  touchTargetMin: number;
  result: "pass" | "fail";
};

function appendA11yEvidence(check: A11yCheck) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  const current = existsSync(EVIDENCE_PATH)
    ? JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"))
    : {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        identity: "visual-foundations@example.test",
        a11yChecks: [] as A11yCheck[],
      };
  current.a11yChecks = [
    ...(current.a11yChecks ?? []).filter((item: A11yCheck) => item.key !== check.key),
    check,
  ];
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

function appendInteractionEvidence(check: InteractionCheck) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  const current = existsSync(EVIDENCE_PATH)
    ? JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"))
    : { schemaVersion: 1, capturedAt: new Date().toISOString() };
  current.interactionChecks = [
    ...(current.interactionChecks ?? []).filter((item: InteractionCheck) => item.key !== check.key),
    check,
  ];
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

async function dismissCookieBanner(page: import("@playwright/test").Page) {
  const acceptCookies = page.getByRole("button", { name: /^Aceitar todos$|^Accept all$/i });
  if (await acceptCookies.isVisible().catch(() => false)) await acceptCookies.click();
}

async function runAxe(page: import("@playwright/test").Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // @ts-expect-error injected by axe-core
    const results = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    return {
      violations: results.violations.map((violation: { id: string; impact?: string; nodes: { target: string[]; html: string; failureSummary?: string }[] }) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
      })),
      incomplete: results.incomplete.map((result: {
        id: string;
        impact?: string | null;
        nodes: { impact?: string | null; target: string[]; html: string; failureSummary?: string }[];
      }) => ({
        id: result.id,
        impact:
          result.impact ??
          result.nodes.find((node) => node.impact === "critical" || node.impact === "serious")?.impact,
        nodes: result.nodes.map((node) => ({ target: node.target, html: node.html, failureSummary: node.failureSummary })),
      })),
    };
  });
}

const A11Y_ROUTES = [
  { key: "login", resolve: () => "/login", authenticate: false },
  { key: "home", resolve: () => "/", authenticate: true },
  { key: "creative-work", resolve: (m: VisualManifest) => m.routes.creativeWork, authenticate: true },
  { key: "dashboard", resolve: (m: VisualManifest) => m.routes.dashboard, authenticate: true },
  { key: "campaign-list", resolve: (m: VisualManifest) => m.routes.campaignList, authenticate: true },
  { key: "campaign-workspace", resolve: (m: VisualManifest) => m.routes.workspace, authenticate: true },
  { key: "variations-workspace", resolve: (m: VisualManifest) => m.routes.variationWorkspace, authenticate: true },
  { key: "library", resolve: (m: VisualManifest) => m.routes.library, authenticate: true },
  { key: "settings", resolve: (m: VisualManifest) => m.routes.settingsProfile, authenticate: true },
  { key: "docs", resolve: () => "/docs", authenticate: true },
  { key: "templates", resolve: () => "/templates", authenticate: true },
  { key: "invite", resolve: () => "/invite?token=invalid", authenticate: false },
  { key: "console", resolve: () => "/feedback", authenticate: true },
] as const;

test.describe("visual a11y gate", () => {
  let manifest: VisualManifest;

  test.beforeAll(() => {
    manifest = seedVisualManifest();
  });

  for (const routeConfig of A11Y_ROUTES) {
    test(`axe audit ${routeConfig.key}`, async ({ page }, testInfo) => {
      manifest = seedVisualManifest();
      const width = testInfo.project.use.viewport?.width ?? 1280;
      const browser = testInfo.project.name.includes("webkit") ? "webkit" : "chromium";
      const route = routeConfig.resolve(manifest);
      if (routeConfig.authenticate) {
        await loginVisualFoundation(page, width <= 768 ? "pt-BR" : "en", width <= 1024 ? "light" : "dark");
      }
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main#main, main").first()).toBeVisible();
      await dismissCookieBanner(page);
      await page.waitForTimeout(400);

      const results = await runAxe(page);
      const indeterminateIncomplete = results.incomplete.filter((result) =>
        result.nodes.every((node) => /could not be determined|partially obscured|only non-text characters|too short to determine/i.test(node.failureSummary ?? "")),
      );
      const blockingIncomplete = results.incomplete.filter(
        (result) =>
          (result.impact === "critical" || result.impact === "serious")
          && !indeterminateIncomplete.includes(result),
      );

      const check: A11yCheck = {
        key: `${routeConfig.key}@${width}:${browser}`,
        route,
        viewport: width,
        browser,
        violations: results.violations.length,
        incomplete: results.incomplete.length,
        indeterminateIncomplete: indeterminateIncomplete.length,
        blockingIncomplete: blockingIncomplete.length,
        result: results.violations.length === 0 && blockingIncomplete.length === 0 ? "pass" : "fail",
      };

      if (results.incomplete.length > 0) {
        console.warn(`Axe incomplete results on ${route}@${width}:`, JSON.stringify(results.incomplete, null, 2));
      }
      if (results.violations.length > 0 || blockingIncomplete.length > 0) {
        console.error(`Blocking a11y findings on ${route}@${width}:`, JSON.stringify({
          violations: results.violations,
          incomplete: blockingIncomplete,
        }, null, 2));
      }
      appendA11yEvidence(check);
      expect(results.violations, `${route}@${width}: axe violations`).toHaveLength(0);
      expect(blockingIncomplete, `${route}@${width}: critical or serious axe incomplete results`).toHaveLength(0);
    });
  }

  test("keyboard, shell, reflow and touch smoke on the login surface", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 1280;
    const browser = testInfo.project.name.includes("webkit") ? "webkit" : "chromium";
    await page.goto("/login", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main#main")).toHaveCount(1);
    await expect(page.locator("main#main")).toBeVisible();

    const shell = await page.evaluate(() => {
      const invalidLabelledBy = Array.from(document.querySelectorAll("[aria-labelledby]"))
        .flatMap((element) => (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean))
        .filter((id, index, ids) => ids.indexOf(id) === index && !document.getElementById(id));
      return {
        mainCount: document.querySelectorAll("main").length,
        skipLinkCount: document.querySelectorAll('a[href="#main"]').length,
        invalidLabelledBy,
      };
    });

    const email = page.locator("#email");
    const password = page.locator("#login-password");
    const submit = page.locator("form:has(#email) button[type=submit]");
    await dismissCookieBanner(page);
    await email.focus();
    const tabTo = async (target: typeof password, maxTabs = 3) => {
      for (let index = 0; index < maxTabs; index += 1) {
        await page.keyboard.press("Tab");
        if (await target.evaluate((element) => element === document.activeElement)) return true;
      }
      return false;
    };
    const passwordFocused = await tabTo(password);
    const submitFocused = await tabTo(submit);

    const accessibleControls =
      await page.getByRole("textbox", { name: /e-?mail|email/i }).count() === 1
      && await page.getByRole("textbox", { name: /password|senha/i }).count() === 1
      && await page.getByRole("button", { name: /^(entrar|sign in)$/i }).count() === 1;
    const touchTargetMin = await page.evaluate(() => {
      const selectors = ["#email", "#login-password", "form:has(#email) button[type=submit]"];
      const dimensions = selectors.map((selector) => {
        const rect = document.querySelector(selector)?.getBoundingClientRect();
        return rect ? Math.min(rect.width, rect.height) : 0;
      });
      return Math.round(Math.min(...dimensions));
    });
    const textResizeOverflowX = await page.evaluate(() => {
      const root = document.documentElement;
      const previous = root.style.fontSize;
      root.style.fontSize = "200%";
      const overflow = root.scrollWidth - root.clientWidth;
      root.style.fontSize = previous;
      return overflow;
    });

    await page.setViewportSize({ width: 1280, height: 480 });
    const lowHeightOverflowX = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );

    const check: InteractionCheck = {
      key: `login-interaction@${width}:${browser}`,
      route: "/login",
      viewport: width,
      browser,
      ...shell,
      focusOrder: passwordFocused && submitFocused,
      accessibleControls,
      textResizeOverflowX,
      lowHeightOverflowX,
      touchTargetMin,
      result:
        shell.mainCount === 1
        && shell.skipLinkCount === 1
        && shell.invalidLabelledBy.length === 0
        && passwordFocused
        && submitFocused
        && accessibleControls
        && textResizeOverflowX <= 2
        && lowHeightOverflowX <= 2
        && touchTargetMin >= 44
          ? "pass"
          : "fail",
    };
    appendInteractionEvidence(check);

    expect(check.mainCount, `login@${width}: exactly one main`).toBe(1);
    expect(check.skipLinkCount, `login@${width}: functional skip link`).toBe(1);
    expect(check.invalidLabelledBy, `login@${width}: valid aria-labelledby refs`).toEqual([]);
    expect(check.focusOrder, `login@${width}: keyboard focus order`).toBe(true);
    expect(check.accessibleControls, `login@${width}: accessible control names`).toBe(true);
    expect(check.textResizeOverflowX, `login@${width}: 200% text resize horizontal overflow`).toBeLessThanOrEqual(2);
    expect(check.lowHeightOverflowX, `login@${width}: low-height horizontal overflow`).toBeLessThanOrEqual(2);
    expect(check.touchTargetMin, `login@${width}: primary touch target`).toBeGreaterThanOrEqual(44);
  });

  test.afterAll(() => {
    if (!existsSync(EVIDENCE_PATH)) return;
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const checks: A11yCheck[] = evidence.a11yChecks ?? [];
    const expectedKeys = [
      [390, "chromium"],
      [768, "chromium"],
      [1280, "chromium"],
      [390, "webkit"],
      [1280, "webkit"],
    ].flatMap(([width, browser]) => A11Y_ROUTES.map((route) => `${route.key}@${width}:${browser}`));
    const expectedInteractionKeys = [390, 768, 1280, 390, 1280].map((width, index) => {
      const browser = index < 3 ? "chromium" : "webkit";
      return `login-interaction@${width}:${browser}`;
    });
    const allA11yPass = expectedKeys.every((key) => checks.some((check) => check.key === key && check.result === "pass"));
    const interactions: InteractionCheck[] = evidence.interactionChecks ?? [];
    const allInteractionPass = expectedInteractionKeys.every((key) =>
      interactions.some((check) => check.key === key && check.result === "pass"),
    );
    evidence.requirements = evidence.requirements ?? {};
    const previousQa17 = evidence.requirements["QA-17"] ?? {};
    const manualPass = previousQa17.manualAssistiveTechnology === "pass"
      && previousQa17.manualZoom200 === "pass"
      && previousQa17.manualDegradedStates === "pass"
      && typeof previousQa17.manualEvidence === "string"
      && previousQa17.manualEvidence.trim().length > 0;
    evidence.requirements["QA-17"] = {
      ...previousQa17,
      result: allA11yPass && allInteractionPass && manualPass ? "pass" : "pending",
      a11y: allA11yPass ? "pass" : "pending",
      interaction: allInteractionPass ? "pass" : "pending",
      expectedA11yChecks: expectedKeys.length,
      completedA11yChecks: checks.filter((check) => expectedKeys.includes(check.key) && check.result === "pass").length,
      expectedInteractionChecks: expectedInteractionKeys.length,
      completedInteractionChecks: interactions.filter((check) => expectedInteractionKeys.includes(check.key) && check.result === "pass").length,
      manualAssistiveTechnology: previousQa17.manualAssistiveTechnology ?? "pending",
      manualZoom200: previousQa17.manualZoom200 ?? "pending",
      manualDegradedStates: previousQa17.manualDegradedStates ?? "pending",
      routes: expectedKeys.join(", "),
    };
    if (!allA11yPass || !allInteractionPass || !manualPass) {
      delete evidence.verifiedAt;
      writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
      return;
    }
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  });
});
