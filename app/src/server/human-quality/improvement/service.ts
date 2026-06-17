import { buildCalibrationComparisons } from "../calibration/compare";
import { RUBRIC_CALIBRATION_VERSION } from "../calibration/report";
import { listEvaluatedCorpusWithEvaluations } from "../../repositories/human-quality-corpus";
import { listAcceptedAdjustments } from "../../repositories/rubric-calibration-adjustments";
import {
  buildQualityImprovementReport,
  splitComparisonsByArm,
  type QualityImprovementReport,
} from "./reevaluate";

const DEFAULT_EVALUATED_ROW_LIMIT = 500;

export interface RunQualityImprovementInput {
  workspaceId?: string;
  improvementDeployedAt?: string;
  cohort?: string;
  capturedAt?: string;
}

export interface RunQualityImprovementResult {
  report: QualityImprovementReport;
  comparisons: import("../calibration/types").CalibrationComparison[];
}

function resolveImprovementDeployedAt(
  acceptedRows: Awaited<ReturnType<typeof listAcceptedAdjustments>>,
  override?: string
): string | undefined {
  if (override) {
    return override;
  }

  const acceptedAtValues = acceptedRows
    .map((row) => row.acceptedAt)
    .filter((value): value is Date => value instanceof Date);

  if (acceptedAtValues.length === 0) {
    return undefined;
  }

  const earliest = acceptedAtValues.reduce((min, current) =>
    current.getTime() < min.getTime() ? current : min
  );

  return earliest.toISOString();
}

export async function runQualityImprovement(
  input: RunQualityImprovementInput = {}
): Promise<RunQualityImprovementResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const [evaluatedRows, acceptedRows] = await Promise.all([
    listEvaluatedCorpusWithEvaluations({
      workspaceId: input.workspaceId,
      cohort: input.cohort,
      limit: DEFAULT_EVALUATED_ROW_LIMIT,
    }),
    listAcceptedAdjustments({ adjustmentVersion: RUBRIC_CALIBRATION_VERSION }),
  ]);

  const comparisons = buildCalibrationComparisons(evaluatedRows);
  const improvementDeployedAt = resolveImprovementDeployedAt(
    acceptedRows,
    input.improvementDeployedAt
  );
  const { before, after } = splitComparisonsByArm(
    evaluatedRows,
    comparisons,
    improvementDeployedAt
  );

  const acceptedAdjustments = acceptedRows.map((row) => ({
    adjustmentId: row.id,
    targetModule: row.targetModule,
    targetKey: row.targetKey,
  }));

  const report = buildQualityImprovementReport({
    beforeComparisons: before,
    afterComparisons: after,
    acceptedAdjustments,
    capturedAt,
  });

  return { report, comparisons: [...before, ...after] };
}

export type { QualityImprovementReport } from "./reevaluate";
