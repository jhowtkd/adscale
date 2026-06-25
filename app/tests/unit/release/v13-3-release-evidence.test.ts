import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { EVIDENCE_SOURCE } from "../../../scripts/lib/evidence-honesty.mjs";
import {
  assertDualStatusSeparation,
  BLENDED_FIELD_DENYLIST,
  REQUIRED_PHASE_SURFACE_KEYS,
  REQUIRED_REQUIREMENT_IDS,
  resolveMilestoneStatus,
  resolveV133PhaseDir,
  validateEvidenceShape,
  validateRequirements,
  validateRootBlendedFields,
} from "../../../scripts/check-v13-3-release-evidence.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../");
const templatePath = resolve(resolveV133PhaseDir(repoRoot), "172-EVIDENCE.template.json");

type RequirementRow = { id: string; result: string; automated: string };

type V133Evidence = {
  schemaVersion: number;
  milestoneVersion: string;
  status: string;
  capturedAt: string;
  verifiedAt: string;
  technicalRegression: Record<string, unknown>;
  operationalEvidence: Record<string, unknown>;
  phaseSurfaces: Record<string, { label: string; status: string; automated: string }>;
  automated: Record<string, unknown>;
  requirements: RequirementRow[];
};

function loadTemplate(): V133Evidence {
  return JSON.parse(readFileSync(templatePath, "utf8")) as V133Evidence;
}

function runValidators(evidence: Partial<V133Evidence>): string[] {
  const errors: string[] = [];
  validateEvidenceShape(evidence, errors);
  assertDualStatusSeparation(evidence, errors);
  return errors;
}

describe("v13-3-release-evidence ALERT-04", () => {
  it("template includes ALERT-01..04 requirements with automated commands", () => {
    const template = loadTemplate();
    const errors: string[] = [];
    validateRequirements(template.requirements, errors);

    expect(errors).toEqual([]);
    expect(template.requirements.map((row) => row.id)).toEqual(REQUIRED_REQUIREMENT_IDS);
    for (const row of template.requirements) {
      expect(row.automated.length).toBeGreaterThan(0);
      expect(["pending", "pass", "fail"]).toContain(row.result);
    }
  });

  it("template validates via check script shape validators", () => {
    expect(runValidators(loadTemplate())).toEqual([]);
  });

  it("template has phaseSurfaces keys for phases 168–172", () => {
    const template = loadTemplate();
    for (const phaseKey of REQUIRED_PHASE_SURFACE_KEYS) {
      expect(template.phaseSurfaces[phaseKey]).toBeDefined();
      expect(template.phaseSurfaces[phaseKey].label).toBeTruthy();
      expect(template.phaseSurfaces[phaseKey].automated).toBeTruthy();
    }
  });

  it("keeps technicalRegression.status separate from operationalEvidence.status when sample insufficient", () => {
    const template = loadTemplate();
    expect(template.technicalRegression.status).toBe("pass");
    expect(template.operationalEvidence.status).toBe("insufficient_sample");
    expect(template.technicalRegression.status).not.toBe(template.operationalEvidence.status);
    expect(template.status).toBe("tech_debt");
  });

  it("resolveMilestoneStatus returns tech_debt when technical pass and operational insufficient", () => {
    const resolved = resolveMilestoneStatus("pass", "insufficient_sample");
    expect(resolved.rootStatus).toBe("tech_debt");
    expect(resolved.exitCode).toBe(0);
  });

  it("resolveMilestoneStatus blocks when technical regression fails", () => {
    const resolved = resolveMilestoneStatus("fail", "ok");
    expect(resolved.rootStatus).toBe("blocked");
    expect(resolved.exitCode).toBe(1);
  });

  it("rejects blended pass fields at root (T-172-07)", () => {
    const evidence = loadTemplate();
    for (const field of BLENDED_FIELD_DENYLIST) {
      const blended = { ...evidence, [field]: true };
      const errors: string[] = [];
      validateRootBlendedFields(blended, errors);
      expect(errors.some((error) => error.includes(field))).toBe(true);
    }
  });

  it("assertDualStatusSeparation errors when root ok with insufficient operational sample", () => {
    const evidence = {
      ...loadTemplate(),
      status: "ok",
      technicalRegression: {
        status: "pass",
        evidenceSource: EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
        gateMatrixPass: true,
      },
      operationalEvidence: {
        status: "insufficient_sample",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        gates: {},
      },
    };
    const errors: string[] = [];
    assertDualStatusSeparation(evidence, errors);
    expect(errors.length).toBeGreaterThan(0);
  });
});
