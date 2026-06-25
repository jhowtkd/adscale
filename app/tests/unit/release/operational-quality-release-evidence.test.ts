import { describe, expect, it } from "vitest";
import { EVIDENCE_SOURCE } from "../../../scripts/lib/evidence-honesty.mjs";
import {
  aggregateOperationalEvidence,
  assertQalive02,
  assertQalive03,
  assertSourceClaimGates,
  buildActiveBrandSample,
  deriveRootStatus,
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

function defaultActiveBrandSample(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return buildActiveBrandSample(
    {
      sourceComposition: {
        synthetic_fixture: 0,
        operator_imported: 0,
        real_customer: 0,
      },
      evaluatedItemCount: 0,
      ...overrides,
    },
    { evaluatedItemCount: 0 }
  );
}

function baseEvidence(overrides: Partial<OperationalEvidence> = {}): OperationalEvidence {
  const activeBrandSample =
    (overrides.operationalEvidence as { activeBrandSample?: Record<string, unknown> } | undefined)
      ?.activeBrandSample ?? defaultActiveBrandSample();

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
      activeBrandSample,
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

  it("returns claim_withheld when active brand sample lacks real_customer source", () => {
    const activeBrandSample = defaultActiveBrandSample({
      sourceComposition: {
        synthetic_fixture: 2,
        operator_imported: 1,
        real_customer: 0,
      },
      evaluatedItemCount: 3,
      operationalStatus: "claim_withheld",
    });

    const result = resolveMilestoneStatus("pass", "insufficient_sample", activeBrandSample);

    expect(result.technicalStatus).toBe("pass");
    expect(result.exitCode).toBe(0);
    expect(result.rootStatus).toBe("claim_withheld");
  });

  it("returns ok when technical and active brand sample are both sufficient", () => {
    const activeBrandSample = defaultActiveBrandSample({
      sourceComposition: {
        synthetic_fixture: 0,
        operator_imported: 1,
        real_customer: 5,
      },
      evaluatedItemCount: 6,
      operationalStatus: "ok",
    });

    const result = resolveMilestoneStatus("pass", "ok", activeBrandSample);

    expect(result.rootStatus).toBe("ok");
    expect(result.exitCode).toBe(0);
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

describe("deriveRootStatus", () => {
  it("returns claim_withheld when active brand sample is fixture-only with rows", () => {
    const activeBrandSample = defaultActiveBrandSample({
      sourceComposition: {
        synthetic_fixture: 1,
        operator_imported: 0,
        real_customer: 0,
      },
      evaluatedItemCount: 1,
      operationalStatus: "claim_withheld",
    });

    expect(deriveRootStatus("pass", "insufficient_sample", activeBrandSample)).toBe(
      "claim_withheld"
    );
  });
});

describe("operational-quality-release-evidence SOURCE-05 active brand sample", () => {
  it("errors when activeBrandSample is missing from operationalEvidence", () => {
    const evidence = baseEvidence();
    delete (evidence.operationalEvidence as { activeBrandSample?: unknown }).activeBrandSample;

    const errors = runQalive02(evidence);
    expect(errors.some((error) => error.includes("activeBrandSample"))).toBe(true);
  });

  it("errors when sourceComposition is missing from activeBrandSample", () => {
    const evidence = baseEvidence({
      operationalEvidence: {
        activeBrandSample: {
          workspaceId: null,
          clientProfileId: null,
          evaluatedItemCount: 0,
          operationalStatus: "insufficient_source",
          fixtureOnly: true,
          claimsAllowed: [],
          claimsBlocked: ["validated_against_customer_real"],
          nextActions: [],
        },
      },
    });

    const errors: string[] = [];
    assertSourceClaimGates(evidence, errors);
    expect(errors.some((error) => error.includes("sourceComposition"))).toBe(true);
  });

  it("errors when fixture-only active brand sample allows customer-real claims", () => {
    const evidence = baseEvidence({
      operationalEvidence: {
        activeBrandSample: defaultActiveBrandSample({
          sourceComposition: {
            synthetic_fixture: 2,
            operator_imported: 0,
            real_customer: 0,
          },
          evaluatedItemCount: 2,
          operationalStatus: "claim_withheld",
          claimsAllowed: ["validated_against_customer_real"],
          claimsBlocked: [],
        }),
      },
    });

    const errors: string[] = [];
    assertSourceClaimGates(evidence, errors);
    expect(errors.some((error) => error.includes("fixture-only"))).toBe(true);
  });

  it("rejects customerValidated blended field at root", () => {
    const errors: string[] = [];
    validateRootBlendedFields({ customerValidated: true }, errors);
    expect(errors.some((error) => error.includes("customerValidated"))).toBe(true);
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
    expect(merged.operationalEvidence.activeBrandSample?.sourceComposition).toEqual({
      synthetic_fixture: 0,
      operator_imported: 0,
      real_customer: 0,
    });
    expect(merged.operationalEvidence.activeBrandSample?.claimsBlocked).toContain(
      "validated_against_customer_real"
    );
  });
});

describe("mergeRegressionIntoTechnical", () => {
  it(
    "runRegression: updates technicalRegression without setting qualityImprovementClaimed true",
    async () => {
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
    },
    15_000
  );
});
