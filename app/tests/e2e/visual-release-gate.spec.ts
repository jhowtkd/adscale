import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  RELEASE_VIEWPORTS,
  loginVisualFoundation,
  releaseLocaleTheme,
  seedVisualManifest,
  type VisualManifest,
} from "./support/visual-auth";
import { VISUAL_RELEASE_LAYOUT_SCENARIOS } from "../../scripts/lib/visual-release-criteria.mjs";

const EVIDENCE_PATH = path.resolve(process.cwd(), "../.planning/phases/114-visual-regression-and-release-gate/114-EVIDENCE.json");

type LayoutCheck = {
  key: string;
  scenario: string;
  route: string;
  viewport: number;
  height: number;
  locale: "pt-BR" | "en";
  theme: "light" | "dark";
  overflowX: number;
  mainVisible: boolean;
  clippedActions: number;
  result: "pass" | "fail";
};

function appendEvidence(check: LayoutCheck) {
  mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
  const current = existsSync(EVIDENCE_PATH)
    ? JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"))
    : {
        schemaVersion: 1,
        capturedAt: new Date().toISOString(),
        identity: "visual-foundations@example.test",
        layoutChecks: [] as LayoutCheck[],
        requirements: {
          "RESP-07": { result: "pending" },
          "QA-15": { result: "pending" },
          "QA-16": { result: "pending" },
        },
      };
  current.layoutChecks = [
    ...(current.layoutChecks ?? []).filter((item: LayoutCheck) => item.key !== check.key),
    check,
  ];
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(current, null, 2)}\n`);
}

async function assertResponsiveLayout(
  page: import("@playwright/test").Page,
  route: string,
  viewport: number,
  scenario: string,
) {
  await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  await expect(page.locator("main#main, main").first()).toBeVisible();

  const report = await page.evaluate(() => {
    const root = document.getElementById("main") ?? document.documentElement;
    const main = document.getElementById("main") ?? document.querySelector("main");
    const overflowX = root.scrollWidth - root.clientWidth;
    const allowedGutter = 2;

    function inScrollableAncestor(element: Element) {
      let node = element.parentElement;
      while (node && node !== main) {
        const style = window.getComputedStyle(node);
        const overflowXStyle = style.overflowX;
        if (overflowXStyle === "auto" || overflowXStyle === "scroll") return true;
        node = node.parentElement;
      }
      return false;
    }

    const clippedActionDetails = Array.from(
      document.querySelectorAll("main button, main a[href], main [role='button']"),
    ).filter((element) => {
      if (inScrollableAncestor(element)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return rect.width > 0
        && rect.height > 0
        && (rect.left < -allowedGutter || rect.right > window.innerWidth + allowedGutter);
    }).map((element) => {
      const rect = element.getBoundingClientRect();
      return `${element.tagName.toLowerCase()}[${element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 60) ?? ""}]@${Math.round(rect.left)}..${Math.round(rect.right)}`;
    });
    return {
      overflowX,
      mainVisible: Boolean(main && main.getBoundingClientRect().height > 0),
      clippedActionDetails,
    };
  });

  const { locale, theme } = releaseLocaleTheme(viewport);
  const height = page.viewportSize()?.height ?? 900;
  const check: LayoutCheck = {
    key: `${scenario}@${viewport}x${height}`,
    scenario,
    route,
    viewport,
    height,
    locale,
    theme,
    overflowX: report.overflowX,
    mainVisible: report.mainVisible,
    clippedActions: report.clippedActionDetails.length,
    result:
      report.overflowX <= 2 && report.mainVisible && report.clippedActionDetails.length === 0 ? "pass" : "fail",
  };

  appendEvidence(check);
  expect(check.overflowX, `${scenario}@${viewport}: horizontal overflow`).toBeLessThanOrEqual(2);
  expect(check.mainVisible, `${scenario}@${viewport}: main visible`).toBe(true);
  expect(check.clippedActions, `${scenario}@${viewport}: clipped actions ${report.clippedActionDetails.join("; ")}`).toBe(0);
  return check;
}

function ticket167Labels(locale: "pt-BR" | "en") {
  return locale === "pt-BR"
    ? {
        help: "Ajuda sobre Peça única",
        protocol: "Peça única",
        manualDirections: "Direcionamentos manuais",
      }
    : {
        help: "Help with Single piece",
        protocol: "Single piece",
        manualDirections: "Manual directions",
      };
}

test.describe("visual release gate", () => {
  let manifest: VisualManifest;

  test.beforeAll(() => {
    manifest = seedVisualManifest();
    expect(RELEASE_VIEWPORTS).toEqual(expect.arrayContaining([390, 768, 1024, 1280, 1440, 1920]));
  });

  const scenarioRoutes: Record<(typeof VISUAL_RELEASE_LAYOUT_SCENARIOS)[number], (m: VisualManifest) => string> = {
    "SCN-DASHBOARD": (m) => m.routes.dashboard,
    "SCN-CAMPAIGN-LIST": (m) => m.routes.campaignList,
    "SCN-CAMPAIGN-WORKSPACE": (m) => m.routes.workspace,
    "SCN-VARIATIONS-WORKSPACE": (m) => m.routes.variationWorkspace,
    "SCN-LIBRARY": () => "/library",
    "SCN-TEMPLATES": () => "/templates",
    "SCN-FEEDBACK": () => "/feedback",
    "SCN-SETTINGS": (m) => m.routes.settingsProfile,
    "SCN-STUDIO-CAROUSEL": (m) => `${m.routes.creativeWork}?intent=carousel`,
    "SCN-STUDIO-EDIT": (m) => `${m.routes.creativeWork}?intent=single`,
  };

  const scenarioEntries = VISUAL_RELEASE_LAYOUT_SCENARIOS.map((scenario) => {
    const resolveRoute = scenarioRoutes[scenario];
    return [scenario, resolveRoute] as const;
  });

  for (const [scenario, resolveRoute] of scenarioEntries) {
    test(`responsive layout ${scenario}`, async ({ page }, testInfo) => {
      manifest = seedVisualManifest();
      const route = resolveRoute(manifest);
      const width = testInfo.project.use.viewport?.width;
      if (!width) throw new Error("Release gate project missing viewport width");
      const { locale, theme } = releaseLocaleTheme(width);
      await loginVisualFoundation(page, locale, theme);
      await assertResponsiveLayout(page, route, width, scenario);
    });
  }

  test("ticket #167 keeps creation and variation controls usable (#370, #373)", async ({ page }, testInfo) => {
    manifest = seedVisualManifest();
    const width = testInfo.project.use.viewport?.width;
    if (width !== 390 && width !== 1280) {
      test.skip(true, "Ticket #167 representative viewports only");
      return;
    }

    await page.goto("/login", { waitUntil: "domcontentloaded" });
    const loginForm = page.locator("form:has(#email:visible)");
    const loginAction = loginForm.getByRole("button", { name: /entrar|sign in|login/i });
    await expect(page.locator("#email:visible")).toBeVisible();
    await expect(page.locator("#login-password:visible")).toBeVisible();
    await expect(loginAction).toBeVisible();
    await expect(loginAction).toBeInViewport();
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBeLessThanOrEqual(2);

    const { locale, theme } = releaseLocaleTheme(width);
    const labels = ticket167Labels(locale);
    await loginVisualFoundation(page, locale, theme);
    await page.goto(`${manifest.routes.creativeWork}?intent=single`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("studio-talk-box").getByRole("button", { name: /Abrir controles|Open controls/ }).click();
    await expect(page.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "true");

    const protocol = page.getByRole("radio", { name: labels.protocol, exact: true });
    const help = page.getByRole("button", { name: labels.help, exact: true });
    await protocol.click();
    await expect(protocol).toHaveAttribute("aria-checked", "true");
    await expect(protocol).toHaveCSS("background-image", /linear-gradient/);
    await expect(help).toHaveCount(0);
    await expect(page.locator('header a[href="/docs"]')).toHaveCount(0);

    await page.goto(manifest.routes.variationWorkspace, { waitUntil: "domcontentloaded" });
    await page.getByTestId("studio-talk-box").getByRole("button", { name: /Abrir controles|Open controls/ }).click();
    await expect(page.getByTestId("studio-talk-box")).toHaveAttribute("data-expanded", "true");
    const variationWorkspace = page.getByTestId("variation-workspace");
    const referenceContext = page.getByTestId("variation-reference-context");
    const directions = page.getByTestId("variation-directions-region");
    const contextHeading = referenceContext.getByRole("heading", { name: /leitura da ia|ai reading/i });
    const optionalSettings = page.getByTestId("creative-optional-settings");
    const generateAction = page.getByTestId("studio-talk-box").getByRole("button", { name: /^(Gerar|Generate)$/ });
    await expect(variationWorkspace).toBeVisible();
    await expect(contextHeading).toBeVisible();
    for (const source of manifest.variationSources) {
      const preview = page.getByRole("img", { name: source.name, exact: true });
      await expect(preview).toBeVisible();
      await expect.poll(() => preview.evaluate((element) =>
        (element as HTMLImageElement).complete && (element as HTMLImageElement).naturalWidth > 0,
      )).toBe(true);
      const naturalSize = await preview.evaluate((element) => ({
        width: (element as HTMLImageElement).naturalWidth,
        height: (element as HTMLImageElement).naturalHeight,
      }));
      expect(naturalSize.width).toBeGreaterThan(0);
      expect(naturalSize.height).toBeGreaterThan(0);
      const expectedRatio = source.width / source.height;
      expect(Math.abs(naturalSize.width / naturalSize.height - expectedRatio) / expectedRatio).toBeLessThan(0.01);
      await expect(preview).toHaveCSS("object-fit", "contain");
    }
    await expect(directions.getByText(labels.manualDirections, { exact: true })).toBeVisible();
    const firstDirection = directions.locator('[role="group"] button').first();
    const selected = await firstDirection.getAttribute("aria-pressed");
    await firstDirection.focus();
    await page.keyboard.press("Space");
    await expect(firstDirection).toHaveAttribute("aria-pressed", selected === "true" ? "false" : "true");
    await directions.getByText(labels.manualDirections, { exact: true }).click();
    await expect(directions.getByRole("textbox", { name: labels.manualDirections, exact: true })).toBeVisible();

    if (testInfo.project.use.hasTouch) {
      const [referenceBox, contextBox, directionsBox, optionalSettingsBox, generateActionBox] = await Promise.all([
        referenceContext.boundingBox(),
        contextHeading.boundingBox(),
        directions.boundingBox(),
        optionalSettings.boundingBox(),
        generateAction.boundingBox(),
      ]);
      expect(referenceBox, "mobile reference context bounds").not.toBeNull();
      expect(contextBox, "mobile AI context bounds").not.toBeNull();
      expect(directionsBox, "mobile directions bounds").not.toBeNull();
      expect(optionalSettingsBox, "mobile optional settings bounds").not.toBeNull();
      expect(generateActionBox, "mobile generate action bounds").not.toBeNull();
      expect(referenceBox!.y, "mobile reference precedes AI context").toBeLessThan(contextBox!.y);
      expect(contextBox!.y, "mobile AI context precedes directions").toBeLessThan(directionsBox!.y);
      expect(directionsBox!.y, "mobile directions precede optional settings").toBeLessThan(optionalSettingsBox!.y);
      expect(directionsBox!.height, "mobile directions have no forced reference height").toBeLessThan(referenceBox!.height);
      expect(optionalSettingsBox!.y, "mobile optional settings precede generate action").toBeLessThan(generateActionBox!.y);
    } else {
      const [referenceBox, contextBox, directionsBox, optionalSettingsBox, generateActionBox] = await Promise.all([
        referenceContext.boundingBox(),
        contextHeading.boundingBox(),
        directions.boundingBox(),
        optionalSettings.boundingBox(),
        generateAction.boundingBox(),
      ]);
      expect(referenceBox, "desktop reference context bounds").not.toBeNull();
      expect(contextBox, "desktop AI context bounds").not.toBeNull();
      expect(directionsBox, "desktop directions bounds").not.toBeNull();
      expect(optionalSettingsBox, "desktop optional settings bounds").not.toBeNull();
      expect(generateActionBox, "desktop generate action bounds").not.toBeNull();
      expect(directionsBox!.x, "desktop directions are to the right of reference context").toBeGreaterThan(referenceBox!.x);
      expect(Math.abs(directionsBox!.y - referenceBox!.y), "desktop reference context and directions share a row").toBeLessThanOrEqual(24);
      expect(Math.abs(directionsBox!.height - referenceBox!.height), "desktop panels share a height").toBeLessThanOrEqual(2);
      expect(optionalSettingsBox!.y, "desktop optional settings follow the variations workspace").toBeGreaterThan(referenceBox!.y);
      expect(generateActionBox!.y, "desktop generate action follows optional settings").toBeGreaterThan(optionalSettingsBox!.y);
    }
  });

  test.afterAll(() => {
    if (!existsSync(EVIDENCE_PATH)) return;
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const checks: LayoutCheck[] = evidence.layoutChecks ?? [];
    const expected = scenarioEntries.length * (RELEASE_VIEWPORTS.length + 1);
    const allPass = checks.length === expected && checks.every((check) => check.result === "pass");
    if (!allPass) return;

    for (const id of ["RESP-07", "QA-15", "QA-16"]) {
      evidence.requirements[id] = {
        result: "pass",
        automated: "npx playwright test --config playwright.release.config.ts",
        browser: checks.map((check) => check.key).join(", "),
      };
    }
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  });
});
