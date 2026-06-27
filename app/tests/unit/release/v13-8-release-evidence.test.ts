import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.cwd(), "..");
const gateScript = resolve(process.cwd(), "scripts/run-v13-8-release-gate.mjs");
const runbook = resolve(repoRoot, "docs/staging/guided-journeys-v13-8-runbook.md");
const template = resolve(
  repoRoot,
  ".planning/phases/200-real-staging-evidence-and-release-gate/200-EVIDENCE.template.json"
);
const currentEvidence = resolve(
  repoRoot,
  ".planning/phases/200-real-staging-evidence-and-release-gate/200-EVIDENCE.json"
);

describe("v13.8 release evidence", () => {
  it("includes release gate script", () => {
    expect(existsSync(gateScript)).toBe(true);
  });

  it("documents staging runbook path", () => {
    expect(existsSync(runbook)).toBe(true);
    const content = readFileSync(runbook, "utf8");
    expect(content).toContain("v13.8");
    expect(content).toContain("existing_creative");
    expect(content).toContain("from_zero");
  });

  it("keeps evidence template honest about pending sample", () => {
    expect(existsSync(template)).toBe(true);
    const parsed = JSON.parse(readFileSync(template, "utf8"));
    expect(parsed.operationalSample.status).toBe("insufficient_sample");
    expect(parsed.stagingEvidence.status).toBe("pending");
  });

  it("records owner waiver without fabricating live evidence", () => {
    const parsed = JSON.parse(readFileSync(currentEvidence, "utf8"));
    expect(parsed.releaseDecision.status).toBe("accepted_debt");
    expect(parsed.releaseDecision.scopes).toEqual([
      "human_staging_walks",
      "operational_sample",
      "live_inngest_lifecycle",
    ]);
    expect(parsed.stagingEvidence.status).toBe("pending");
    expect(parsed.operationalSample.guidedStarts).toBe(0);
    expect(parsed.inheritedDebt.liveInngestLifecycle).toBe("unverified");
  });
});
