import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");
const gateScript = resolve(process.cwd(), "scripts/run-v13-9-release-gate.mjs");
const template = resolve(
  repoRoot,
  ".planning/phases/207-iterative-copilot-integration-and-uat/207-EVIDENCE.template.json"
);
const desktopSpec = resolve(
  process.cwd(),
  "tests/e2e/iterative-copilot-loop.desktop.spec.ts"
);
const mobileSpec = resolve(
  process.cwd(),
  "tests/e2e/iterative-copilot-loop.mobile.spec.ts"
);

describe("v13.9 release evidence", () => {
  it("includes release gate script", () => {
    expect(existsSync(gateScript)).toBe(true);
  });

  it("lists iteration Playwright specs in the gate script", () => {
    const content = readFileSync(gateScript, "utf8");
    expect(content).toContain("iterative-copilot-loop.desktop.spec.ts");
    expect(content).toContain("iterative-copilot-loop.mobile.spec.ts");
    expect(content).toContain("ITERATION_E2E_SPECS");
  });

  it("ships desktop and mobile iteration e2e specs", () => {
    expect(existsSync(desktopSpec)).toBe(true);
    expect(existsSync(mobileSpec)).toBe(true);
  });

  it("keeps evidence template honest about pending staging and sample", () => {
    expect(existsSync(template)).toBe(true);
    const parsed = JSON.parse(readFileSync(template, "utf8"));
    expect(parsed.milestone).toBe("v13.9");
    expect(parsed.stagingEvidence.status).toBe("pending");
    expect(parsed.operationalSample.status).toBe("insufficient_sample");
    expect(parsed.playwrightTests.specs).toEqual([
      "tests/e2e/iterative-copilot-loop.desktop.spec.ts",
      "tests/e2e/iterative-copilot-loop.mobile.spec.ts",
    ]);
  });
});
