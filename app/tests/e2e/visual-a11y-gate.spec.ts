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
  violations: number;
  incomplete: number;
  blockingIncomplete: number;
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

async function runAxe(page: import("@playwright/test").Page) {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    // @ts-expect-error injected by axe-core
    const results = await window.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    });
    return {
      violations: results.violations.map((violation: { id: string; impact?: string; nodes: unknown[] }) => ({
        id: violation.id,
        impact: violation.impact,
        nodes: violation.nodes.length,
      })),
      incomplete: results.incomplete.map((result: {
        id: string;
        impact?: string | null;
        nodes: { impact?: string | null }[];
      }) => ({
        id: result.id,
        impact:
          result.impact ??
          result.nodes.find((node) => node.impact === "critical" || node.impact === "serious")?.impact,
        nodes: result.nodes.length,
      })),
    };
  });
}

const A11Y_ROUTES = [
  { key: "login", resolve: () => "/login", authenticate: false },
  { key: "creative-work", resolve: (m: VisualManifest) => m.routes.creativeWork, authenticate: true },
  { key: "dashboard", resolve: (m: VisualManifest) => m.routes.dashboard, authenticate: true },
  { key: "campaign-list", resolve: (m: VisualManifest) => m.routes.campaignList, authenticate: true },
  { key: "campaign-workspace", resolve: (m: VisualManifest) => m.routes.workspace, authenticate: true },
  { key: "variations-workspace", resolve: (m: VisualManifest) => m.routes.variationWorkspace, authenticate: true },
  { key: "library", resolve: (m: VisualManifest) => m.routes.library, authenticate: true },
  { key: "settings", resolve: (m: VisualManifest) => m.routes.settingsProfile, authenticate: true },
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
      const route = routeConfig.resolve(manifest);
      if (routeConfig.authenticate) {
        await loginVisualFoundation(page, width <= 768 ? "pt-BR" : "en", width <= 1024 ? "light" : "dark");
      }
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main#main, main").first()).toBeVisible();

      const results = await runAxe(page);
      const blockingIncomplete = results.incomplete.filter(
        (result) => result.impact === "critical" || result.impact === "serious",
      );

      const check: A11yCheck = {
        key: `${routeConfig.key}@${width}`,
        route,
        viewport: width,
        violations: results.violations.length,
        incomplete: results.incomplete.length,
        blockingIncomplete: blockingIncomplete.length,
        result: results.violations.length === 0 && blockingIncomplete.length === 0 ? "pass" : "fail",
      };

      if (results.incomplete.length > 0) {
        console.warn(`Axe incomplete results on ${route}@${width}:`, results.incomplete);
      }
      if (results.violations.length > 0 || blockingIncomplete.length > 0) {
        console.error(`Blocking a11y findings on ${route}@${width}:`, {
          violations: results.violations,
          incomplete: blockingIncomplete,
        });
      }
      expect(results.violations, `${route}@${width}: axe violations`).toHaveLength(0);
      expect(blockingIncomplete, `${route}@${width}: critical or serious axe incomplete results`).toHaveLength(0);
      appendA11yEvidence(check);
    });
  }

  test.afterAll(() => {
    if (!existsSync(EVIDENCE_PATH)) return;
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const checks: A11yCheck[] = evidence.a11yChecks ?? [];
    const expectedKeys = [390, 1280].flatMap((width) => A11Y_ROUTES.map((route) => `${route.key}@${width}`));
    if (!expectedKeys.every((key) => checks.some((check) => check.key === key && check.result === "pass"))) return;
    evidence.requirements = evidence.requirements ?? {};
    evidence.requirements["QA-17"] = {
      ...(evidence.requirements["QA-17"] ?? {}),
      a11y: "pass",
      routes: checks.map((check) => check.key).join(", "),
    };
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  });
});
