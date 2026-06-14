import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginVisualFoundation, seedVisualManifest, type VisualManifest } from "./support/visual-auth";

const axePath = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");
const EVIDENCE_PATH = path.resolve(process.cwd(), "../.planning/phases/114-visual-regression-and-release-gate/114-EVIDENCE.json");

const DEFERRED_RULES = new Set(["color-contrast", "color-contrast-enhanced"]);

type A11yCheck = {
  key: string;
  route: string;
  viewport: number;
  violations: number;
  deferredViolations: number;
  blockingViolations: number;
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
        deferredDefects: ["DEFECT-CONTRAST"],
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
    };
  });
}

const A11Y_ROUTES = ["/", "/campaigns", "/library", "/settings?tab=profile"] as const;

test.describe("visual a11y gate", () => {
  let manifest: VisualManifest;

  test.beforeAll(() => {
    manifest = seedVisualManifest();
  });

  for (const route of A11Y_ROUTES) {
    test(`axe audit ${route}`, async ({ page }, testInfo) => {
      manifest = seedVisualManifest();
      const width = testInfo.project.use.viewport?.width ?? 1280;
      await loginVisualFoundation(page, width <= 768 ? "pt-BR" : "en", width <= 1024 ? "light" : "dark");
      await page.goto(route === "/" ? manifest.routes.dashboard : route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main#main, main").first()).toBeVisible();

      const results = await runAxe(page);
      const deferredViolations = results.violations.filter((violation) => DEFERRED_RULES.has(violation.id));
      const blockingViolations = results.violations.filter((violation) => !DEFERRED_RULES.has(violation.id));

      const check: A11yCheck = {
        key: `${route}@${width}`,
        route,
        viewport: width,
        violations: results.violations.length,
        deferredViolations: deferredViolations.length,
        blockingViolations: blockingViolations.length,
        result: blockingViolations.length === 0 ? "pass" : "fail",
      };

      if (blockingViolations.length > 0) {
        console.error(`Blocking a11y violations on ${route}@${width}:`, blockingViolations);
      }
      expect(check.blockingViolations, `${route}@${width}: blocking axe violations`).toBe(0);
      appendA11yEvidence(check);
    });
  }

  test.afterAll(() => {
    if (!existsSync(EVIDENCE_PATH)) return;
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const checks: A11yCheck[] = evidence.a11yChecks ?? [];
    if (!checks.length || checks.some((check) => check.result !== "pass")) return;
    evidence.requirements = evidence.requirements ?? {};
    evidence.requirements["QA-17"] = {
      ...(evidence.requirements["QA-17"] ?? {}),
      a11y: "pass",
      routes: checks.map((check) => check.key).join(", "),
    };
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`);
  });
});
