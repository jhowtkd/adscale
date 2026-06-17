import { describe, expect, it } from "vitest";
import {
  assertQa24,
  HUMAN_VISUAL_TARGET,
  V12_3_FIXTURE_BASELINE,
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

describe("real-quality-release-evidence QA-23 metric separation", () => {
  it("rejects blended pass fields at evidence root", () => {
    const errors: string[] = [];
    validateMetricSeparation({ overallPass: true }, errors);
    expect(errors.some((error) => error.includes("overallPass"))).toBe(true);
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
