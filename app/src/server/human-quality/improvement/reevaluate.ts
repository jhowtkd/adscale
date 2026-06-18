import { CORPUS_ARCHETYPE_FIXTURES, type CorpusArchetype } from "../../ai/corpus-fixtures";
import { normalizeCreativeQaResult } from "../../ai/creative-qa";
import {
  classifyCreativeQualityGate,
  deriveQualityVerdict,
} from "../../ai/creative-quality-gate";
import type { CalibrationComparison, EvaluatedCorpusRow } from "../calibration/types";
import { RUBRIC_CALIBRATION_VERSION } from "../calibration/report";
import { buildQualityImprovementGuidance } from "../sampling/guidance";
import { MIN_SLICE_SAMPLE } from "../sampling/thresholds";
import type { SampleGuidance } from "../sampling/types";
import type { HumanQualityFailureReason } from "../corpus";

export { MIN_SLICE_SAMPLE };
import { TARGETED_VISUAL_FAILURE_REASONS } from "./types";

export interface FailureFrequencyEntry {
  count: number;
  rate: number | null;
}

export interface QualityImprovementAcceptedAdjustment {
  adjustmentId: string;
  targetModule: string;
  targetKey: string;
}

export interface QualityImprovementReport {
  schemaVersion: 1;
  rubricCalibrationVersion: string;
  capturedAt: string;
  status: "ok" | "insufficient_sample";
  targetedFailureReasons: readonly HumanQualityFailureReason[];
  sampleGuidance: SampleGuidance[];
  visualMetrics: {
    failureFrequencyBefore: Record<string, FailureFrequencyEntry>;
    failureFrequencyAfter: Record<string, FailureFrequencyEntry>;
    deltaRateByReason: Record<string, number | null>;
  };
  factualMetrics: {
    factualPassRateBefore: number | null;
    factualPassRateAfter: number | null;
  };
  fixtureMetrics?: {
    targetedArchetypePassRateBefore: number | null;
    targetedArchetypePassRateAfter: number | null;
  };
  acceptedAdjustments: QualityImprovementAcceptedAdjustment[];
}

const TARGETED_ARCHETYPE_BY_REASON: Record<
  (typeof TARGETED_VISUAL_FAILURE_REASONS)[number],
  CorpusArchetype
> = {
  visual_overload: "visual_overload",
  weak_hierarchy: "weak_hierarchy",
  generic_template_feel: "generic_template_aesthetic",
  illegible_cta: "illegible_cta",
  unfocused_composition: "unfocused_composition",
};

const TARGETED_ARCHETYPES = new Set(Object.values(TARGETED_ARCHETYPE_BY_REASON));

const TARGETED_FIXTURES = CORPUS_ARCHETYPE_FIXTURES.filter((fixture) =>
  TARGETED_ARCHETYPES.has(fixture.archetype)
);

function isFixtureGateDetectionPass(
  fixture: (typeof TARGETED_FIXTURES)[number],
  useBaselineSnapshot: boolean
): boolean {
  if (useBaselineSnapshot) {
    return fixture.baselineVerdict === fixture.expectedVerdict;
  }

  const qa = normalizeCreativeQaResult(fixture.rawQaModelOutput);
  const gate = classifyCreativeQualityGate({
    contract: fixture.contract,
    checklist: qa.checklist,
  });
  const verdict = deriveQualityVerdict({
    hardFailures: gate.hardFailures,
    qualityScore: 85,
    checklist: qa.checklist,
  });
  const codesMatch = fixture.expectedHardFailureCodes.every((code) =>
    gate.hardFailures.some((failure) => failure.code === code)
  );

  return verdict === fixture.expectedVerdict && codesMatch;
}

function computePassRate(useBaselineSnapshot: boolean): number | null {
  if (TARGETED_FIXTURES.length === 0) {
    return null;
  }

  const passCount = TARGETED_FIXTURES.filter((fixture) =>
    isFixtureGateDetectionPass(fixture, useBaselineSnapshot)
  ).length;

  return passCount / TARGETED_FIXTURES.length;
}

/** Frozen pre-132-02 baseline snapshot for deterministic before-arm fixture comparison. */
export const PRE_132_02_FIXTURE_BASELINE_PASS_RATE = computePassRate(true) ?? 0;

export function computeFixtureArchetypePassRate(
  useBaselineSnapshot: boolean
): number | null {
  return computePassRate(useBaselineSnapshot);
}

export function failureRatesByReason(
  comparisons: CalibrationComparison[]
): Record<string, FailureFrequencyEntry> {
  const total = comparisons.length;
  const out: Record<string, FailureFrequencyEntry> = {};

  for (const reason of TARGETED_VISUAL_FAILURE_REASONS) {
    const count = comparisons.filter(
      (comparison) => comparison.primaryFailureReason === reason
    ).length;
    out[reason] = {
      count,
      rate: total > 0 ? count / total : null,
    };
  }

  return out;
}

function computeFactualPassRate(
  comparisons: CalibrationComparison[]
): number | null {
  if (comparisons.length === 0) {
    return null;
  }

  const passCount = comparisons.filter((comparison) => comparison.factualPass).length;
  return passCount / comparisons.length;
}

export function splitComparisonsByArm(
  rows: EvaluatedCorpusRow[],
  comparisons: CalibrationComparison[],
  improvementDeployedAt?: string
): { before: CalibrationComparison[]; after: CalibrationComparison[] } {
  const comparisonById = new Map(
    comparisons.map((comparison) => [comparison.corpusItemId, comparison])
  );
  const deployMs = improvementDeployedAt
    ? new Date(improvementDeployedAt).getTime()
    : null;

  const before: CalibrationComparison[] = [];
  const after: CalibrationComparison[] = [];

  for (const row of rows) {
    const comparison = comparisonById.get(row.item.id);
    if (!comparison) {
      continue;
    }

    if (row.item.cohort === "post_learning") {
      after.push(comparison);
      continue;
    }

    const selectedMs = new Date(row.item.selectedAt).getTime();
    const selectedBeforeDeploy =
      deployMs !== null && !Number.isNaN(selectedMs) && selectedMs < deployMs;

    if (
      row.item.cohort === "baseline" ||
      row.item.cohort === "pre_learning" ||
      selectedBeforeDeploy
    ) {
      before.push(comparison);
    }
  }

  return { before, after };
}

function resolveReportStatus(
  beforeRates: Record<string, FailureFrequencyEntry>,
  afterRates: Record<string, FailureFrequencyEntry>,
  afterComparisons: CalibrationComparison[]
): "ok" | "insufficient_sample" {
  if (afterComparisons.length === 0) {
    return "insufficient_sample";
  }

  const allAfterCountsZero = TARGETED_VISUAL_FAILURE_REASONS.every(
    (reason) => (afterRates[reason]?.count ?? 0) === 0
  );
  if (allAfterCountsZero) {
    return "insufficient_sample";
  }

  for (const reason of TARGETED_VISUAL_FAILURE_REASONS) {
    const beforeCount = beforeRates[reason]?.count ?? 0;
    const afterCount = afterRates[reason]?.count ?? 0;
    if (beforeCount < MIN_SLICE_SAMPLE || afterCount < MIN_SLICE_SAMPLE) {
      return "insufficient_sample";
    }
  }

  return "ok";
}

function buildDeltaRateByReason(
  beforeRates: Record<string, FailureFrequencyEntry>,
  afterRates: Record<string, FailureFrequencyEntry>,
  status: QualityImprovementReport["status"]
): Record<string, number | null> {
  const deltas: Record<string, number | null> = {};

  for (const reason of TARGETED_VISUAL_FAILURE_REASONS) {
    if (status === "insufficient_sample") {
      deltas[reason] = null;
      continue;
    }

    const beforeRate = beforeRates[reason]?.rate;
    const afterRate = afterRates[reason]?.rate;

    if (beforeRate == null || afterRate == null) {
      deltas[reason] = null;
      continue;
    }

    deltas[reason] = afterRate - beforeRate;
  }

  return deltas;
}

export interface BuildQualityImprovementReportInput {
  beforeComparisons: CalibrationComparison[];
  afterComparisons: CalibrationComparison[];
  acceptedAdjustments: QualityImprovementAcceptedAdjustment[];
  capturedAt: string;
  rubricCalibrationVersion?: string;
}

export function buildQualityImprovementReport(
  input: BuildQualityImprovementReportInput
): QualityImprovementReport {
  const failureFrequencyBefore = failureRatesByReason(input.beforeComparisons);
  const failureFrequencyAfter = failureRatesByReason(input.afterComparisons);
  const status = resolveReportStatus(
    failureFrequencyBefore,
    failureFrequencyAfter,
    input.afterComparisons
  );

  const reasonCounts = TARGETED_VISUAL_FAILURE_REASONS.map((reason) => ({
    reason,
    beforeCount: failureFrequencyBefore[reason]?.count ?? 0,
    afterCount: failureFrequencyAfter[reason]?.count ?? 0,
  }));

  const sampleGuidance =
    status === "ok" ? [] : buildQualityImprovementGuidance(reasonCounts);

  return {
    schemaVersion: 1,
    rubricCalibrationVersion:
      input.rubricCalibrationVersion ?? RUBRIC_CALIBRATION_VERSION,
    capturedAt: input.capturedAt,
    status,
    targetedFailureReasons: TARGETED_VISUAL_FAILURE_REASONS,
    sampleGuidance,
    visualMetrics: {
      failureFrequencyBefore,
      failureFrequencyAfter,
      deltaRateByReason: buildDeltaRateByReason(
        failureFrequencyBefore,
        failureFrequencyAfter,
        status
      ),
    },
    factualMetrics: {
      factualPassRateBefore: computeFactualPassRate(input.beforeComparisons),
      factualPassRateAfter: computeFactualPassRate(input.afterComparisons),
    },
    fixtureMetrics: {
      targetedArchetypePassRateBefore: computeFixtureArchetypePassRate(true),
      targetedArchetypePassRateAfter: computeFixtureArchetypePassRate(false),
    },
    acceptedAdjustments: input.acceptedAdjustments,
  };
}
