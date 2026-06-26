import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");
const evidenceTemplate = resolve(
  repoRoot,
  ".planning/phases/194-operational-release-gate/194-EVIDENCE.template.json"
);
const runbook = resolve(repoRoot, "docs/staging/guided-journeys-v13-7-runbook.md");
const gateScript = resolve(process.cwd(), "scripts/run-v13-7-release-gate.mjs");

describe("v13.7 release evidence artifacts", () => {
  it("includes evidence template with separate gate dimensions", () => {
    const template = JSON.parse(readFileSync(evidenceTemplate, "utf8"));
    expect(template.milestoneVersion).toBe("v13.7");
    expect(template.implementation).toBeDefined();
    expect(template.automatedTests).toBeDefined();
    expect(template.stagingEvidence).toBeDefined();
    expect(template.operationalSample).toBeDefined();
  });

  it("ships staging runbook and release gate script", () => {
    expect(existsSync(runbook)).toBe(true);
    expect(existsSync(gateScript)).toBe(true);
  });
});
