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

const EVIDENCE_PATH = path.resolve(process.cwd(), "../.planning/phases/114-visual-regression-and-release-gate/114-EVIDENCE.json");

type LayoutCheck = {
  key: string;
  scenario: string;
  route: string;
  viewport: number;
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

    const clippedActions = Array.from(
      document.querySelectorAll("main button, main a[href], main [role='button']"),
    ).filter((element) => {
      if (inScrollableAncestor(element)) return false;
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return false;
      return rect.width > 0 && rect.height > 0 && (rect.right < -2 || rect.left > window.innerWidth + 2);
    }).length;
    return {
      overflowX,
      mainVisible: Boolean(main && main.getBoundingClientRect().height > 0),
      clippedActions,
    };
  });

  const { locale, theme } = releaseLocaleTheme(viewport);
  const check: LayoutCheck = {
    key: `${scenario}@${viewport}`,
    scenario,
    route,
    viewport,
    locale,
    theme,
    ...report,
    result:
      report.overflowX <= 2 && report.mainVisible && report.clippedActions === 0 ? "pass" : "fail",
  };

  expect(check.overflowX, `${scenario}@${viewport}: horizontal overflow`).toBeLessThanOrEqual(2);
  expect(check.mainVisible, `${scenario}@${viewport}: main visible`).toBe(true);
  expect(check.clippedActions, `${scenario}@${viewport}: clipped actions`).toBe(0);
  appendEvidence(check);
  return check;
}

test.describe("visual release gate", () => {
  let manifest: VisualManifest;

  test.beforeAll(() => {
    manifest = seedVisualManifest();
    expect(RELEASE_VIEWPORTS).toEqual(expect.arrayContaining([390, 768, 1024, 1280, 1440, 1920]));
  });

  const scenarioEntries = [
    ["SCN-DASHBOARD", (m: VisualManifest) => m.routes.dashboard],
    ["SCN-CAMPAIGN-LIST", (m: VisualManifest) => m.routes.campaignList],
    ["SCN-CAMPAIGN-WORKSPACE", (m: VisualManifest) => m.routes.workspace],
    ["SCN-LIBRARY", () => "/library"],
    ["SCN-TEMPLATES", () => "/templates"],
    ["SCN-RESTYLING", () => "/restyling"],
    ["SCN-QUICK-RESTYLING", () => "/quick-tools/restyling"],
    ["SCN-FEEDBACK", () => "/feedback"],
    ["SCN-SETTINGS", (m: VisualManifest) => m.routes.settingsProfile],
  ] as const;

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

  test.afterAll(() => {
    if (!existsSync(EVIDENCE_PATH)) return;
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const checks: LayoutCheck[] = evidence.layoutChecks ?? [];
    const expected = scenarioEntries.length * RELEASE_VIEWPORTS.length;
    const allPass = checks.length >= expected && checks.every((check) => check.result === "pass");
    if (!allPass) return;

    evidence.verifiedAt = new Date().toISOString();
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
