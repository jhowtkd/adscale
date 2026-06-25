import { describe, expect, it } from "vitest";
import { validateFactualOnly } from "../../../scripts/check-creative-validation-evidence.mjs";
import { EVIDENCE_SOURCE } from "../../../scripts/lib/evidence-honesty.mjs";
import {
  assertQa24,
  HUMAN_VISUAL_TARGET,
  PHASE_EVIDENCE,
  V12_3_FIXTURE_BASELINE,
  aggregateEvidence,
  runRegressionMode,
  validateMetricSeparation,
} from "../../../scripts/check-real-quality-release-evidence.mjs";

type Evidence = {
  qualityMetrics: {
    humanCorpus: {
      meanHumanVisualScore: number | null;
    };
  };
  factualMetrics: {
    humanCorpusFactualPassRate: number;
    v12_3FactualFidelityRate: number;
  };
  learningImpactMetrics: {
    status: string;
  };
  acceptedCaveats: Array<Record<string, unknown>>;
};

function baseEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    qualityMetrics: {
      humanCorpus: {
        meanHumanVisualScore: null,
        ...(overrides.qualityMetrics?.humanCorpus ?? {}),
      },
      ...overrides.qualityMetrics,
    },
    factualMetrics: {
      humanCorpusFactualPassRate: 1.0,
      v12_3FactualFidelityRate: 1.0,
      ...overrides.factualMetrics,
    },
    learningImpactMetrics: {
      status: "insufficient_sample",
      ...overrides.learningImpactMetrics,
    },
    acceptedCaveats: overrides.acceptedCaveats ?? [],
  };
}

function runQa24(evidence: Evidence): string[] {
  const errors: string[] = [];
  assertQa24(evidence, errors);
  return errors;
}

describe("creative-validation-evidence --factual-only", () => {
  it("passes factual checks when meanQualityScore is below QA-19 threshold", () => {
    const evidence = {
      afterCaptures: [
        {
          key: "smoke:art_variation:1:1",
          hardFailures: [],
        },
      ],
    };
    const errors: string[] = [];
    const aggregate = validateFactualOnly(evidence, errors, {
      fidelityHitsFn: () => [],
      computeAggregateFn: () => ({
        meanQualityScore: 70.17,
        factualFidelityRate: 1,
        fidelityPassCount: 1,
        totalCount: 1,
      }),
    });

    expect(errors).toEqual([]);
    expect(aggregate?.meanQualityScore).toBe(70.17);
    expect(aggregate?.factualFidelityRate).toBe(1);
  });

  it("fails factual-only when fidelity rate is below threshold", () => {
    const errors: string[] = [];
    validateFactualOnly(
      { afterCaptures: [{ key: "k", hardFailures: [] }] },
      errors,
      {
        fidelityHitsFn: () => [],
        computeAggregateFn: () => ({
          meanQualityScore: 80,
          factualFidelityRate: 0.9,
          fidelityPassCount: 9,
          totalCount: 10,
        }),
      }
    );

    expect(errors.some((error) => error.includes("factualFidelityRate"))).toBe(true);
  });
});

describe("real-quality-release-evidence QA-24", () => {
  it("Path A passes when meanHumanVisualScore >= target and factual rates are 1.0", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: 76 } },
      acceptedCaveats: [],
    });

    expect(runQa24(evidence)).toEqual([]);
  });

  it("Path A fails when meanHumanVisualScore is below target and no caveat exists", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: 74 } },
      acceptedCaveats: [],
    });

    const errors = runQa24(evidence);
    expect(errors.some((error) => error.includes("QA-24"))).toBe(true);
    expect(errors.some((error) => error.includes(String(HUMAN_VISUAL_TARGET)))).toBe(true);
  });

  it("Path B passes with accepted_gap caveat when gap shrinks vs baseline", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: null } },
      acceptedCaveats: [
        {
          id: "visual_quality_gap",
          status: "accepted_gap",
          priorBaseline: V12_3_FIXTURE_BASELINE,
          currentValue: 72,
          acceptedAt: "2026-06-17",
          rationale: "Human corpus insufficient; fixture factual green; gap narrowed",
          acceptedBy: "operator",
        },
      ],
    });

    expect(runQa24(evidence)).toEqual([]);
  });

  it("Path B fails when caveat gap is not smaller than prior gap", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: null } },
      acceptedCaveats: [
        {
          id: "visual_quality_gap",
          status: "accepted_gap",
          priorBaseline: V12_3_FIXTURE_BASELINE,
          currentValue: 70.17,
          acceptedAt: "2026-06-17",
          rationale: "Gap unchanged",
          acceptedBy: "operator",
        },
      ],
    });

    const errors = runQa24(evidence);
    expect(errors.some((error) => error.includes("gap"))).toBe(true);
  });

  it("Path B fails when accepted_gap caveat is missing acceptedAt or rationale", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: null } },
      acceptedCaveats: [
        {
          id: "visual_quality_gap",
          status: "accepted_gap",
          priorBaseline: V12_3_FIXTURE_BASELINE,
          currentValue: 72,
          acceptedBy: "operator",
        },
      ],
    });

    const errors = runQa24(evidence);
    expect(errors.some((error) => error.includes("acceptedAt"))).toBe(true);
    expect(errors.some((error) => error.includes("rationale"))).toBe(true);
  });

  it("hard fails when humanCorpusFactualPassRate is below 1.0 regardless of caveat", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: 80 } },
      factualMetrics: {
        humanCorpusFactualPassRate: 0.9,
        v12_3FactualFidelityRate: 1.0,
      },
      acceptedCaveats: [],
    });

    const errors = runQa24(evidence);
    expect(errors.some((error) => error.includes("humanCorpusFactualPassRate"))).toBe(true);
  });

  it("hard fails when v12_3FactualFidelityRate is below 1.0", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: 80 } },
      factualMetrics: {
        humanCorpusFactualPassRate: 1.0,
        v12_3FactualFidelityRate: 0.99,
      },
    });

    const errors = runQa24(evidence);
    expect(errors.some((error) => error.includes("v12_3FactualFidelityRate"))).toBe(true);
  });

  it("does not add QA-24 errors for insufficient_sample learning impact when visual path passes", () => {
    const evidence = baseEvidence({
      qualityMetrics: { humanCorpus: { meanHumanVisualScore: 76 } },
      learningImpactMetrics: { status: "insufficient_sample" },
    });

    expect(runQa24(evidence)).toEqual([]);
  });
});

describe("real-quality-release-evidence regression metrics", () => {
  it(
    "keeps regressionMetrics separate from qualityMetrics root after runRegressionMode",
    () => {
    const evidence = aggregateEvidence({
      acceptedCaveats: [
        {
          id: "visual_quality_gap",
          status: "accepted_gap",
          priorBaseline: V12_3_FIXTURE_BASELINE,
          currentValue: 72,
          acceptedAt: "2026-06-17",
          rationale: "Fixture factual green; human corpus pending",
          acceptedBy: "operator",
        },
      ],
    });

    const { evidence: updated } = runRegressionMode(evidence, { skipTests: true });

    expect(updated.regressionMetrics).toEqual({
      gateMatrixPass: true,
      creativeValidationScript: "factual_only_pass",
      outputLearningScript: "pass",
    });
    expect(updated.qualityMetrics?.humanCorpus?.meanHumanVisualScore).toBeNull();
    expect(updated.factualMetrics?.v12_3FactualFidelityRate).toBe(1);
    expect(updated.factualMetrics?.v12_3RegressionSubsetPassed).toBe(true);

    const separationErrors: string[] = [];
    validateMetricSeparation(updated, separationErrors);
    expect(separationErrors).toEqual([]);
    expect(runQa24(updated)).toEqual([]);
    },
    20_000
  );

  it("exposes PHASE_EVIDENCE paths for sub-phase audit trail", () => {
    expect(PHASE_EVIDENCE.calibration).toContain("130-EVIDENCE.json");
    expect(PHASE_EVIDENCE.fixture).toContain("123-EVIDENCE.json");
  });
});

describe("real-quality-release-evidence QA-23 metric separation", () => {
  it("rejects blended pass fields at evidence root", () => {
    const errors: string[] = [];
    validateMetricSeparation({ overallPass: true }, errors);
    expect(errors.some((error) => error.includes("overallPass"))).toBe(true);
  });

  it("rejects customerValidated blended field at evidence root", () => {
    const errors: string[] = [];
    validateMetricSeparation({ customerValidated: true }, errors);
    expect(errors.some((error) => error.includes("customerValidated"))).toBe(true);
  });

  it("rejects meanHumanVisualScore duplicated in factualMetrics", () => {
    const errors: string[] = [];
    validateMetricSeparation(
      {
        factualMetrics: { meanHumanVisualScore: 80 },
      },
      errors
    );
    expect(errors.length).toBeGreaterThan(0);
  });
});

export function taggedAggregateEvidence(overrides: Record<string, unknown> = {}) {
  const aggregated = aggregateEvidence({
    acceptedCaveats: [
      {
        id: "visual_quality_gap",
        status: "accepted_gap",
        evidenceSource: EVIDENCE_SOURCE.ACCEPTED_CAVEAT,
        priorBaseline: V12_3_FIXTURE_BASELINE,
        currentValue: 72,
        acceptedAt: "2026-06-17",
        rationale: "Human corpus insufficient; fixture factual green",
        acceptedBy: "operator",
      },
    ],
  });

  return {
    ...aggregated,
    ...overrides,
    qualityMetrics: {
      ...aggregated.qualityMetrics,
      ...(overrides.qualityMetrics as object | undefined),
      humanCorpus: {
        ...aggregated.qualityMetrics.humanCorpus,
        evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
        denominatorNote: "Human-evaluated corpus items only",
        ...(overrides.qualityMetrics as { humanCorpus?: object } | undefined)?.humanCorpus,
      },
      fixtureValidation: {
        ...aggregated.qualityMetrics.fixtureValidation,
        evidenceSource: EVIDENCE_SOURCE.FIXTURE,
        denominatorNote: "Deterministic v12.3 matrix — not human corpus",
        ...(overrides.qualityMetrics as { fixtureValidation?: object } | undefined)?.fixtureValidation,
      },
    },
    acceptedCaveats: overrides.acceptedCaveats ?? aggregated.acceptedCaveats,
  };
}

describe("real-quality-release-evidence SAMPLE-03 evidenceSource tags", () => {
  it("rejects humanCorpus missing evidenceSource live_human", () => {
    const errors: string[] = [];
    validateMetricSeparation(
      {
        qualityMetrics: {
          humanCorpus: { evaluatedItemCount: 0, sourcePath: "x" },
          fixtureValidation: { evidenceSource: EVIDENCE_SOURCE.FIXTURE, sourcePath: "y" },
        },
        acceptedCaveats: [],
      },
      errors
    );
    expect(errors.some((error) => error.includes("evidenceSource"))).toBe(true);
    expect(errors.some((error) => error.includes("live_human"))).toBe(true);
  });

  it("rejects fixtureValidation missing evidenceSource fixture", () => {
    const errors: string[] = [];
    validateMetricSeparation(
      {
        qualityMetrics: {
          humanCorpus: { evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN, sourcePath: "x" },
          fixtureValidation: { meanQualityScore: 70.17, sourcePath: "y" },
        },
        acceptedCaveats: [],
      },
      errors
    );
    expect(errors.some((error) => error.includes("fixture"))).toBe(true);
  });

  it("rejects acceptedCaveats entries missing evidenceSource accepted_caveat", () => {
    const errors: string[] = [];
    validateMetricSeparation(
      {
        qualityMetrics: {
          humanCorpus: { evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN, sourcePath: "x" },
          fixtureValidation: { evidenceSource: EVIDENCE_SOURCE.FIXTURE, sourcePath: "y" },
        },
        acceptedCaveats: [{ id: "visual_quality_gap", status: "accepted_gap" }],
      },
      errors
    );
    expect(errors.some((error) => error.includes("accepted_caveat"))).toBe(true);
  });

  it("passes valid tagged aggregate evidence shape", () => {
    const evidence = taggedAggregateEvidence();
    const errors: string[] = [];
    validateMetricSeparation(evidence, errors);
    expect(errors).toEqual([]);
  });

  it("rejects empty human corpus claiming ok calibration status", () => {
    const errors: string[] = [];
    validateMetricSeparation(
      {
        qualityMetrics: {
          humanCorpus: {
            evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
            evaluatedItemCount: 0,
            meanHumanVisualScore: 72,
            calibrationStatus: "ok",
            sourcePath: "x",
          },
          fixtureValidation: { evidenceSource: EVIDENCE_SOURCE.FIXTURE, sourcePath: "y" },
        },
        acceptedCaveats: [],
      },
      errors
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it("aggregateEvidence tags humanCorpus and fixtureValidation with evidenceSource", () => {
    const evidence = aggregateEvidence({
      acceptedCaveats: [
        {
          id: "visual_quality_gap",
          status: "accepted_gap",
          evidenceSource: EVIDENCE_SOURCE.ACCEPTED_CAVEAT,
          priorBaseline: V12_3_FIXTURE_BASELINE,
          currentValue: 72,
          acceptedAt: "2026-06-17",
          rationale: "test",
          acceptedBy: "operator",
        },
      ],
    });

    expect(evidence.qualityMetrics.humanCorpus.evidenceSource).toBe(EVIDENCE_SOURCE.LIVE_HUMAN);
    expect(evidence.qualityMetrics.fixtureValidation.evidenceSource).toBe(EVIDENCE_SOURCE.FIXTURE);
    expect(evidence.qualityMetrics.humanCorpus.evaluatedItemCount).not.toBe(
      evidence.qualityMetrics.fixtureValidation.meanQualityScore
    );
  });
});
