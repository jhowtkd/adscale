import { describe, expect, it } from "vitest";
import { EVIDENCE_SOURCE } from "../../../../scripts/lib/evidence-honesty.mjs";
import { validateEvidenceShape as validateCalibrationEvidence } from "../../../../scripts/check-score-calibration-evidence.mjs";
import { validateEvidenceShape as validateImpactEvidence } from "../../../../scripts/check-learning-impact-evidence.mjs";
import { validateEvidenceShape as validateQualityEvidence } from "../../../../scripts/check-quality-improvement-evidence.mjs";
import {
  REQUIRED_REQUIREMENT_IDS,
  validateEvidenceShape as validateSamplingEvidence,
} from "../../../../scripts/check-sampling-sufficiency-evidence.mjs";
import { validateMetricSeparation } from "../../../../scripts/check-real-quality-release-evidence.mjs";
import { taggedAggregateEvidence } from "../../release/real-quality-release-evidence.test";

function collectErrors(validate: (evidence: unknown, errors: string[], label?: string) => void, evidence: unknown) {
  const errors: string[] = [];
  validate(evidence, errors);
  return errors;
}

const calibrationInsufficient = {
  schemaVersion: 1,
  rubricCalibrationVersion: "1.0.0",
  status: "insufficient_corpus",
  evaluatedItemCount: 2,
  sampleGuidance: [
    {
      gate: "calibration_global",
      currentCount: 2,
      requiredCount: 5,
      additionalNeeded: 3,
      blockedClaim: "Global calibration aggregates withheld",
    },
  ],
  visualMetrics: {
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    meanAbsError: null,
    meanSignedDelta: null,
    overScoreCount: 0,
    underScoreCount: 0,
    divergenceByFailureReason: {},
    divergenceByMode: {},
    divergenceByFormat: {},
    comparisons: [],
  },
  factualMetrics: {
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    factualPassRate: 1,
    factualFailCount: 0,
    highVisualButFactualFail: [],
  },
  requirements: [
    { id: "CALIB-01" },
    { id: "CALIB-02" },
    { id: "CALIB-03" },
    { id: "CALIB-04" },
  ],
};

const impactInsufficient = {
  schemaVersion: 1,
  learningImpactVersion: "1.0.0",
  status: "insufficient_sample",
  evaluatedItemCount: 2,
  insufficientReasons: ["global_below_minimum"],
  sampleGuidance: [
    {
      gate: "impact_global",
      currentCount: 2,
      requiredCount: 5,
      additionalNeeded: 3,
      blockedClaim: "Movement deltas withheld",
    },
  ],
  learningImpactMetrics: {
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    learnedCount: 1,
    nonLearnedCount: 1,
    unlabeledCount: 0,
    slices: [],
    globalVisualScoreDelta: null,
  },
  intentMetrics: {
    learned: { rejectRate: 0, regenerateRate: 0 },
    nonLearned: { rejectRate: 0, regenerateRate: 0 },
  },
  visualMovementMetrics: {
    learnedMeanVisualScore: 70,
    nonLearnedMeanVisualScore: 65,
    deltaLearnedMinusNonLearned: null,
  },
  factualMetrics: {
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    learnedFactualPassRate: 1,
    nonLearnedFactualPassRate: 1,
  },
  rows: [],
  requirements: [
    { id: "IMPACT-01" },
    { id: "IMPACT-02" },
    { id: "IMPACT-03" },
    { id: "IMPACT-04" },
  ],
};

const qualityInsufficient = {
  schemaVersion: 1,
  rubricCalibrationVersion: "1.1.0",
  status: "insufficient_sample",
  targetedFailureReasons: ["visual_overload"],
  sampleGuidance: [
    {
      gate: "quality_improvement_reason",
      dimension: "visual_overload",
      currentCount: 0,
      requiredCount: 3,
      additionalNeeded: 3,
      blockedClaim: "Per-reason deltas withheld",
    },
  ],
  visualMetrics: {
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    failureFrequencyBefore: {
      visual_overload: { count: 0, rate: null },
      weak_hierarchy: { count: 0, rate: null },
      generic_template_feel: { count: 0, rate: null },
      illegible_cta: { count: 0, rate: null },
      unfocused_composition: { count: 0, rate: null },
    },
    failureFrequencyAfter: {
      visual_overload: { count: 0, rate: null },
      weak_hierarchy: { count: 0, rate: null },
      generic_template_feel: { count: 0, rate: null },
      illegible_cta: { count: 0, rate: null },
      unfocused_composition: { count: 0, rate: null },
    },
    deltaRateByReason: {
      visual_overload: null,
      weak_hierarchy: null,
      generic_template_feel: null,
      illegible_cta: null,
      unfocused_composition: null,
    },
  },
  factualMetrics: {
    evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
    factualPassRateBefore: null,
    factualPassRateAfter: null,
  },
  fixtureMetrics: {
    evidenceSource: EVIDENCE_SOURCE.FIXTURE,
    targetedArchetypePassRateBefore: 1,
    targetedArchetypePassRateAfter: 1,
  },
  acceptedAdjustments: [],
  regressionMetrics: {
    factualFidelityRate: 1,
    safetyGuardPassRate: 1,
  },
  requirements: [
    { id: "QUALITY-01" },
    { id: "QUALITY-02" },
    { id: "QUALITY-03" },
    { id: "QUALITY-04" },
  ],
};

describe("evidence honesty child checkers", () => {
  it("calibration checker requires sampleGuidance when insufficient_corpus", () => {
    const withoutGuidance = { ...calibrationInsufficient, sampleGuidance: [] };
    expect(collectErrors(validateCalibrationEvidence, withoutGuidance).length).toBeGreaterThan(0);
    expect(collectErrors(validateCalibrationEvidence, calibrationInsufficient)).toEqual([]);
  });

  it("calibration checker rejects movement metrics when guidance blocks claims", () => {
    const bad = {
      ...calibrationInsufficient,
      visualMetrics: {
        ...calibrationInsufficient.visualMetrics,
        meanAbsError: 10,
      },
      improvementClaimed: true,
    };
    const errors = collectErrors(validateCalibrationEvidence, bad);
    expect(errors.some((error) => error.includes("meanAbsError"))).toBe(true);
    expect(errors.some((error) => error.includes("improvementClaimed"))).toBe(true);
  });

  it("impact checker requires sampleGuidance when insufficient_sample", () => {
    const withoutGuidance = { ...impactInsufficient, sampleGuidance: undefined };
    expect(collectErrors(validateImpactEvidence, withoutGuidance).length).toBeGreaterThan(0);
    expect(collectErrors(validateImpactEvidence, impactInsufficient)).toEqual([]);
  });

  it("impact checker rejects non-null movement deltas when insufficient", () => {
    const bad = {
      ...impactInsufficient,
      learningImpactMetrics: {
        ...impactInsufficient.learningImpactMetrics,
        globalVisualScoreDelta: 5,
      },
    };
    expect(
      collectErrors(validateImpactEvidence, bad).some((error) =>
        error.includes("globalVisualScoreDelta")
      )
    ).toBe(true);
  });

  it("quality checker requires fixture evidenceSource and null deltas when insufficient", () => {
    const missingFixtureTag = {
      ...qualityInsufficient,
      fixtureMetrics: {
        targetedArchetypePassRateBefore: 1,
        targetedArchetypePassRateAfter: 1,
      },
    };
    expect(collectErrors(validateQualityEvidence, missingFixtureTag).length).toBeGreaterThan(0);

    const badDelta = {
      ...qualityInsufficient,
      visualMetrics: {
        ...qualityInsufficient.visualMetrics,
        deltaRateByReason: {
          ...qualityInsufficient.visualMetrics.deltaRateByReason,
          visual_overload: -0.1,
        },
      },
    };
    expect(
      collectErrors(validateQualityEvidence, badDelta).some((error) =>
        error.includes("deltaRateByReason")
      )
    ).toBe(true);

    expect(collectErrors(validateQualityEvidence, qualityInsufficient)).toEqual([]);
  });
});

describe("sampling sufficiency phase 135 evidence gate", () => {
  it("documents SAMPLE-01..04 requirement IDs", () => {
    expect(REQUIRED_REQUIREMENT_IDS).toEqual([
      "SAMPLE-01",
      "SAMPLE-02",
      "SAMPLE-03",
      "SAMPLE-04",
    ]);
  });

  it("passes on canonical 135 template shape", () => {
    const template = {
      schemaVersion: 1,
      requirements: ["SAMPLE-01", "SAMPLE-02", "SAMPLE-03", "SAMPLE-04"],
      gates: {
        calibration: {
          status: "insufficient_corpus",
          evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
          sampleGuidance: [
            {
              gate: "calibration_global",
              currentCount: 0,
              requiredCount: 5,
              additionalNeeded: 5,
              blockedClaim: "blocked",
            },
          ],
        },
        impact: {
          status: "insufficient_sample",
          evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
          sampleGuidance: [
            {
              gate: "impact_global",
              currentCount: 0,
              requiredCount: 5,
              additionalNeeded: 5,
              blockedClaim: "blocked",
            },
          ],
        },
        qualityImprovement: {
          status: "insufficient_sample",
          evidenceSource: EVIDENCE_SOURCE.LIVE_HUMAN,
          fixtureMetrics: {
            evidenceSource: EVIDENCE_SOURCE.FIXTURE,
            targetedArchetypePassRateBefore: 0.7,
            targetedArchetypePassRateAfter: null,
          },
          sampleGuidance: [
            {
              gate: "quality_improvement_reason",
              currentCount: 0,
              requiredCount: 3,
              additionalNeeded: 3,
              blockedClaim: "blocked",
            },
          ],
        },
        technicalRegression: {
          status: "ok",
          evidenceSource: EVIDENCE_SOURCE.TECHNICAL_REGRESSION,
        },
      },
    };

    expect(collectErrors(validateSamplingEvidence, template)).toEqual([]);
  });
});

describe("aggregate evidence honesty", () => {
  it("tagged aggregate passes release metric separation", () => {
    const evidence = taggedAggregateEvidence();
    const errors: string[] = [];
    validateMetricSeparation(evidence, errors);
    expect(errors).toEqual([]);
  });
});
