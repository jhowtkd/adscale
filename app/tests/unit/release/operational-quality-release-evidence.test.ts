import { describe, expect, it } from "vitest";
import { EVIDENCE_SOURCE } from "../../../scripts/lib/evidence-honesty.mjs";
import {
  aggregateOperationalEvidence,
  assertQalive02,
  assertQalive03,
  mergeRegressionIntoTechnical,
  PHASE_EVIDENCE_V126,
  validateRootBlendedFields,
} from "../../../scripts/check-operational-quality-release-evidence.mjs";
import { resolveMilestoneStatus } from "../../../scripts/run-operational-quality-release-gate.mjs";

type OperationalEvidence = {
  schemaVersion: number;
  milestoneVersion: string;
  status: string;
  qualityImprovementClaimed: boolean;
  technicalRegression: Record<string, unknown>;
  operationalEvidence: Record<string, unknown>;
  factualMetrics: {
    humanCorpusFactualPassRate: number;
    v12_3FactualFidelityRate: number;
    safetyGuardPassRate: number;
  };
  qualityMetrics: Record<string, unknown>;
  learningImpactMetrics: Record<string, unknown>;
  trendMetrics: Record<string, unknown>;
  acceptedCaveats: unknown[];
  automated: Record<string, unknown>;
  requirements: Array<{ id: string; result: string; automated: string }>;
};

function baseEvidence(overrides: Partial<OperationalEvidence> = {}): OperationalEvidence {
  return {
    schemaVersion: 1,
    milestoneVersion: "v12.6",
    status: "tech_debt",
    qualityImprovementClaimed: false,
    technicalRegression: {
      status: "pass",
      evidenceSource: EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
      gateMatrixPass: true,
      v12_3FactualFidelityRate: 1.0,
      safetyGuardPassRate: 1.0,
      sourcePath: ".planning/phases/133-real-quality-release-gate/133-EVIDENCE.json",
      ...(overrides.technicalRegression ?? {}),
    },
    operationalEvidence: {
      status: "insufficient_sample",
      evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
      evaluatedItemCount: 0,
      gates: {
        qualityImprovement: {
          status: "insufficient_sample",
          evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
          sampleGuidance: [
            {
              gate: "quality_improvement_reason",
              currentCount: 0,
              requiredCount: 3,
              additionalNeeded: 3,
              blockedClaim: "Per-reason improvement deltas withheld",
            },
          ],
          fixtureMetrics: {
            evidenceSource: EVIDENCE_SOURCE.FIXTURE,
          },
        },
      },
      ...(overrides.operationalEvidence ?? {}),
    },
    factualMetrics: {
      humanCorpusFactualPassRate: 1.0,
      v12_3FactualFidelityRate: 1.0,
      safetyGuardPassRate: 1.0,
      ...overrides.factualMetrics,
    },
    qualityMetrics: {
      humanCorpus: { evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN },
      fixtureValidation: { evidenceSource: EVIDENCE_SOURCE.FIXTURE },
    },
    learningImpactMetrics: { status: "insufficient_sample" },
    trendMetrics: { evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN, status: "insufficient_sample" },
    acceptedCaveats: [],
    automated: {},
    requirements: [
      { id: "QALIVE-01", result: "pending", automated: "pending" },
      { id: "QALIVE-02", result: "pending", automated: "pending" },
      { id: "QALIVE-03", result: "pending", automated: "pending" },
      { id: "QALIVE-04", result: "pending", automated: "pending" },
    ],
    ...overrides,
  };
}

function runQalive02(evidence: Partial<OperationalEvidence>): string[] {
  const errors: string[] = [];
  assertQalive02(evidence, errors);
  return errors;
}

function runQalive03(evidence: Partial<OperationalEvidence>): string[] {
  const errors: string[] = [];
  assertQalive03(evidence, errors);
  return errors;
}

describe("operational-quality-release-evidence QALIVE-02", () => {
  it("allows technical pass with operational insufficient_sample", () => {
    expect(runQalive02(baseEvidence())).toEqual([]);
  });

  it("errors when technical fail regardless of operational status", () => {
    const evidence = baseEvidence({
      technicalRegression: {
        status: "fail",
        evidenceSource: EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
      },
      operationalEvidence: {
        status: "ok",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
      },
    });

    const errors = runQalive02(evidence);
    expect(errors.some((error) => error.includes("QALIVE-02"))).toBe(true);
    expect(errors.some((error) => error.includes("fail"))).toBe(true);
  });

  it("errors when technicalRegression section is missing", () => {
    const evidence = baseEvidence();
    delete (evidence as { technicalRegression?: unknown }).technicalRegression;

    const errors = runQalive02(evidence);
    expect(errors.some((error) => error.includes("technicalRegression"))).toBe(true);
  });

  it("errors when operationalEvidence missing live_human evidenceSource", () => {
    const evidence = baseEvidence({
      operationalEvidence: {
        status: "insufficient_sample",
        evidenceSource: "fixture",
      },
    });

    const errors = runQalive02(evidence);
    expect(errors.some((error) => error.includes("live_human"))).toBe(true);
  });

  it("rejects milestonePass blended field at root", () => {
    const evidence = {
      ...baseEvidence(),
      milestonePass: true,
    };

    const errors = runQalive02(evidence);
    expect(errors.some((error) => error.includes("milestonePass"))).toBe(true);
  });
});

describe("operational-quality-release-evidence QALIVE-03", () => {
  it("errors when qualityImprovementClaimed true and gate status insufficient_sample", () => {
    const evidence = baseEvidence({
      qualityImprovementClaimed: true,
      operationalEvidence: {
        status: "insufficient_sample",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        gates: {
          qualityImprovement: {
            status: "insufficient_sample",
            evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
            sampleGuidance: [],
          },
        },
      },
    });

    const errors = runQalive03(evidence);
    expect(errors.some((error) => error.includes("QALIVE-03"))).toBe(true);
    expect(errors.some((error) => error.includes("gate status"))).toBe(true);
  });

  it("errors when qualityImprovementClaimed true and humanCorpusFactualPassRate is 0.9", () => {
    const evidence = baseEvidence({
      qualityImprovementClaimed: true,
      factualMetrics: {
        humanCorpusFactualPassRate: 0.9,
        v12_3FactualFidelityRate: 1.0,
        safetyGuardPassRate: 1.0,
      },
      operationalEvidence: {
        status: "ok",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        gates: {
          qualityImprovement: {
            status: "ok",
            evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
            sampleGuidance: [],
          },
        },
      },
    });

    const errors = runQalive03(evidence);
    expect(errors.some((error) => error.includes("humanCorpusFactualPassRate"))).toBe(true);
  });

  it("errors when qualityImprovementClaimed true and sampleGuidance has additionalNeeded > 0", () => {
    const evidence = baseEvidence({
      qualityImprovementClaimed: true,
      operationalEvidence: {
        status: "ok",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        gates: {
          qualityImprovement: {
            status: "ok",
            evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
            sampleGuidance: [
              {
                gate: "quality_improvement_reason",
                currentCount: 1,
                requiredCount: 3,
                additionalNeeded: 2,
                blockedClaim: "blocked",
              },
            ],
          },
        },
      },
    });

    const errors = runQalive03(evidence);
    expect(errors.some((error) => error.includes("sampleGuidance"))).toBe(true);
  });

  it("errors when root status ok with operational insufficient_sample and claim not false", () => {
    const evidence = baseEvidence({
      status: "ok",
      qualityImprovementClaimed: true,
      operationalEvidence: {
        status: "insufficient_sample",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        gates: {
          qualityImprovement: {
            status: "insufficient_sample",
            evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
          },
        },
      },
    });

    const errors = runQalive03(evidence);
    expect(errors.some((error) => error.includes("root status ok"))).toBe(true);
  });

  it("passes when qualityImprovementClaimed false with insufficient operational sample", () => {
    expect(runQalive03(baseEvidence())).toEqual([]);
  });
});

describe("resolveMilestoneStatus", () => {
  it("returns technical pass without aborting when operational insufficient_sample", () => {
    const result = resolveMilestoneStatus("pass", "insufficient_sample");

    expect(result.technicalStatus).toBe("pass");
    expect(result.exitCode).toBe(0);
    expect(result.rootStatus).toBe("tech_debt");
  });

  it("blocks with exit 1 when technical fails regardless of operational status", () => {
    const result = resolveMilestoneStatus("fail", "ok");

    expect(result.technicalStatus).toBe("fail");
    expect(result.exitCode).toBe(1);
    expect(result.rootStatus).toBe("blocked");
  });

  it("returns ok when both technical and operational pass", () => {
    const result = resolveMilestoneStatus("pass", "ok");

    expect(result.rootStatus).toBe("ok");
    expect(result.exitCode).toBe(0);
  });
});

describe("operational-quality-release-evidence blended field denylist", () => {
  it("rejects BLENDED_FIELD_DENYLIST field at root", () => {
    const errors: string[] = [];
    validateRootBlendedFields({ overallPass: true }, errors);
    expect(errors.some((error) => error.includes("overallPass"))).toBe(true);
  });
});

describe("aggregateOperationalEvidence", () => {
  it("aggregate: operationalEvidence.gates.trend.sourcePath points to 136 evidence path", () => {
    const merged = aggregateOperationalEvidence({});

    expect(merged.operationalEvidence.gates.trend.sourcePath).toBe(PHASE_EVIDENCE_V126.trend);
    expect(merged.milestoneVersion).toBe("v12.6");
    expect(merged.qualityImprovementClaimed).toBe(false);
    expect(merged.operationalEvidence.sampleCoverage?.sourcePath).toBe(
      PHASE_EVIDENCE_V126.sampling
    );
  });
});

describe("mergeRegressionIntoTechnical", () => {
  it("runRegression: updates technicalRegression without setting qualityImprovementClaimed true", () => {
    const evidence = baseEvidence({
      qualityImprovementClaimed: false,
      operationalEvidence: {
        status: "insufficient_sample",
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        evaluatedItemCount: 0,
        gates: {
          qualityImprovement: {
            status: "insufficient_sample",
            evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
          },
        },
      },
    });

    const { errors } = mergeRegressionIntoTechnical(evidence, { skipTests: true });

    expect(errors).toEqual([]);
    expect(evidence.technicalRegression?.gateMatrixPass).toBe(true);
    expect(evidence.technicalRegression?.creativeValidationScript).toBe("factual_only_pass");
    expect(evidence.qualityImprovementClaimed).toBe(false);
    expect(evidence.operationalEvidence?.status).toBe("insufficient_sample");
  });
});
