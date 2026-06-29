import path from "node:path";
import { expect, test } from "@playwright/test";
import { loginVisualFoundation } from "./support/visual-auth";

const axePath = path.resolve(process.cwd(), "node_modules/axe-core/axe.min.js");

const DEFERRED_RULES = new Set(["color-contrast", "color-contrast-enhanced"]);

const V6_PREVIEW_ROUTES = ["/v6", "/v6/topbar-promo"] as const;

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

test.describe("v6 preview a11y gate", () => {
  for (const route of V6_PREVIEW_ROUTES) {
    test(`axe audit ${route}`, async ({ page }) => {
      await loginVisualFoundation(page, "pt-BR", "dark");
      await page.goto(route, { waitUntil: "domcontentloaded" });
      await expect(page.locator("main#main, main").first()).toBeVisible();

      const results = await runAxe(page);
      const blockingViolations = results.violations.filter(
        (violation) => !DEFERRED_RULES.has(violation.id),
      );

      if (blockingViolations.length > 0) {
        console.error(`Blocking a11y violations on ${route}:`, blockingViolations);
      }
      expect(blockingViolations.length, `${route}: blocking axe violations`).toBe(0);
    });
  }
});
