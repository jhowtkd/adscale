import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
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

async function waitForA11yReady(page: Page, ready?: Locator) {
  if (ready) await expect(ready).toBeVisible();
  await page.evaluate(async () => {
    let timedOut = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        (async () => {
          let quietFrames = 0;
          while (quietFrames < 2 && !timedOut) {
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            const animations = document.getAnimations().filter((animation) =>
              animation.effect?.getTiming().iterations !== Infinity
              && animation.playState !== "finished"
              && animation.playState !== "idle",
            );
            quietFrames = animations.length === 0 ? quietFrames + 1 : 0;
            await Promise.allSettled(animations.map((animation) => animation.finished));
          }
        })(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => {
            timedOut = true;
            reject(new Error("Finite animations did not settle within 10 seconds"));
          }, 10_000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
  });
}

test.describe("a11y motion regression", () => {
  async function mountAnimatedText(page: Page, color = "#96989b") {
    await page.setContent(`<!doctype html><html lang="en"><head><title>A11y motion fixture</title>
      <style>body { background: #090a0c; font: 16px Arial; }</style></head>
      <body><main></main></body></html>`);
    await page.evaluate((textColor) => {
      // Model client-side content mounting after the route shell is visible.
      setTimeout(() => {
        const text = document.createElement("p");
        text.textContent = "Instagram, Facebook, LinkedIn";
        text.style.color = textColor;
        document.querySelector("main")!.appendChild(text);
        // Starts at a readable intermediate opacity so the fixed-sleep control is deterministic.
        text.animate({ opacity: [0.55, 1] }, { duration: 1500, easing: "linear", fill: "forwards" });
      }, 320);
    }, color);
    return page.getByText("Instagram, Facebook, LinkedIn", { exact: true });
  }

  test("controle: espera fixa reporta color-contrast durante o fade", async ({ page }) => {
    await mountAnimatedText(page);
    await page.waitForTimeout(400);
    const results = await runAxe(page);
    expect(results.violations.map((violation) => violation.id)).toContain("color-contrast");
  });

  test("estabilizado: aguarda montagem e fade antes do axe", async ({ page }) => {
    const ready = await mountAnimatedText(page);
    await waitForA11yReady(page, ready);
    const results = await runAxe(page);
    expect(results.violations.filter((violation) => violation.id === "color-contrast")).toHaveLength(0);
    expect(await ready.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
  });

  test("contraste baixo permanente continua falhando", async ({ page }) => {
    const ready = await mountAnimatedText(page, "#4a4b4d");
    await waitForA11yReady(page, ready);
    expect(await ready.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
    const results = await runAxe(page);
    expect(results.violations.map((violation) => violation.id)).toContain("color-contrast");
  });

  test("animacao infinita nao bloqueia", async ({ page }) => {
    await page.setContent(`<style>@keyframes spin { to { transform: rotate(360deg); } }
      #spinner { width: 20px; height: 20px; animation: spin 1s linear infinite; }</style>
      <main><div id="spinner" aria-hidden="true"></div><p>Ready content</p></main>`);
    await waitForA11yReady(page, page.getByText("Ready content", { exact: true }));
    expect(await page.evaluate(() => document.getAnimations().some(
      (animation) => animation.effect?.getTiming().iterations === Infinity && animation.playState === "running",
    ))).toBe(true);
  });
});

const A11Y_ROUTES: {
  key: string;
  resolve: (manifest: VisualManifest) => string;
  authenticate: boolean;
  ready?: (page: Page) => Locator;
}[] = [
  { key: "login", resolve: () => "/login", authenticate: false },
  { key: "home", resolve: () => "/", authenticate: true },
  { key: "creative-work", resolve: (m: VisualManifest) => m.routes.creativeWork, authenticate: true },
  { key: "dashboard", resolve: (m: VisualManifest) => m.routes.dashboard, authenticate: true },
  { key: "campaign-list", resolve: (m: VisualManifest) => m.routes.campaignList, authenticate: true },
  {
    key: "campaign-workspace",
    resolve: (m: VisualManifest) => m.routes.workspace,
    authenticate: true,
    ready: (page) => page.getByText("Instagram, Facebook, LinkedIn", { exact: true }),
  },
  { key: "variations-workspace", resolve: (m: VisualManifest) => m.routes.variationWorkspace, authenticate: true },
  { key: "library", resolve: (m: VisualManifest) => m.routes.library, authenticate: true },
  { key: "settings", resolve: (m: VisualManifest) => m.routes.settingsProfile, authenticate: true },
  { key: "docs", resolve: () => "/docs", authenticate: true },
  { key: "templates", resolve: () => "/templates", authenticate: true },
  { key: "invite", resolve: () => "/invite?token=invalid", authenticate: false },
  { key: "console", resolve: () => "/feedback", authenticate: true },
];

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
      await waitForA11yReady(page, routeConfig.ready?.(page));

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

  test("axe audit campaign-workspace with late campaign fetch", async ({ page }) => {
    manifest = seedVisualManifest();
    await loginVisualFoundation(page, "en", "dark");
    // The subtitle only mounts (and fades in) once the client-side campaign fetch resolves.
    await page.route(/\/api\/campaigns\/[^/?]+(\?.*)?$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 320));
      await route.continue();
    });
    await page.goto(manifest.routes.workspace, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main#main, main").first()).toBeVisible();
    await dismissCookieBanner(page);
    await waitForA11yReady(page, A11Y_ROUTES.find((item) => item.key === "campaign-workspace")?.ready?.(page));

    const results = await runAxe(page);
    expect(results.violations, "campaign-workspace with late fetch: axe violations").toHaveLength(0);
  });

  test("keyboard, shell, reflow and touch smoke on the login surface", async ({ page }, testInfo) => {
    const width = testInfo.project.use.viewport?.width ?? 1280;
    const browser = testInfo.project.name.includes("webkit") ? "webkit" : "chromium";
    await page.addInitScript(() => {
      localStorage.setItem(
        "adscale_cookie_consent",
        JSON.stringify({ necessary: true, analytics: false, marketing: false }),
      );
    });
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
    // Mobile WebKit/Chromium do not move focus on Tab. Sequential DOM order is
    // the keyboard contract for email → password → submit.
    const sequentialTabHops = (fromSelector: string, toSelector: string, maxHops: number) =>
      page.evaluate(({ fromSelector: from, toSelector: to, maxHops: hops }) => {
        const isVisible = (element: Element) => {
          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display !== "none"
            && style.visibility !== "hidden"
            && style.visibility !== "collapse"
            && rect.width > 0
            && rect.height > 0;
        };
        const isProductControl = (element: Element) =>
          !element.closest("nextjs-portal, [data-next-badge-root], [data-nextjs-toast]");
        const tabbables = Array.from(document.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )).filter((element) => element.tabIndex >= 0 && isVisible(element) && isProductControl(element));
        const origin = document.querySelector(from);
        const target = document.querySelector(to);
        if (!origin || !target) return false;
        const fromIndex = tabbables.indexOf(origin as HTMLElement);
        const toIndex = tabbables.indexOf(target as HTMLElement);
        return fromIndex >= 0 && toIndex > fromIndex && toIndex - fromIndex <= hops;
      }, { fromSelector, toSelector, maxHops });
    const passwordFocused = await sequentialTabHops("#email", "#login-password", 8);
    const submitFocused = passwordFocused
      && await sequentialTabHops("#login-password", "form:has(#email) button[type=submit]", 8);

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
