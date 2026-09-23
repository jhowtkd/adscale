import { listEvaluatedCorpusWithEvaluations } from "../../repositories/human-quality-corpus";
import {
  insertProposedAdjustments,
  listExistingAdjustmentKeys,
  listProposedAdjustments,
} from "../../repositories/rubric-calibration-adjustments";
import {
  proposeAdjustments,
  type ProposedAdjustment,
} from "./adjustments";
import { buildCalibrationComparisons } from "./compare";
import {
  buildCalibrationReport,
  RUBRIC_CALIBRATION_VERSION,
  toAdjustmentProposalSummaryFromRow,
  type CalibrationReport,
} from "./report";

export interface RunScoreCalibrationInput {
  workspaceId?: string;
  clientProfileId?: string;
  cohort?: string;
  capturedAt?: string;
}

export interface RunScoreCalibrationResult {
  report: CalibrationReport;
  persistedAdjustments: ProposedAdjustment[];
}

export async function persistProposedAdjustments(
  proposals: ProposedAdjustment[]
): Promise<ProposedAdjustment[]> {
  if (proposals.length === 0) return [];

  const keyOf = (proposal: {
    adjustmentVersion: string;
    targetModule: string;
    targetKey: string;
    sliceKey: string;
  }) =>
    JSON.stringify([
      proposal.adjustmentVersion,
      proposal.targetModule,
      proposal.targetKey,
      proposal.sliceKey,
    ]);
  const unique = [
    ...new Map(proposals.map((proposal) => [keyOf(proposal), proposal])).values(),
  ];
  const existing = await listExistingAdjustmentKeys(
    [...new Set(unique.map((proposal) => proposal.adjustmentVersion))],
    [...new Set(unique.map((proposal) => proposal.sliceKey))]
  );
  const existingKeys = new Set(existing.map(keyOf));
  const missing = unique.filter((proposal) => !existingKeys.has(keyOf(proposal)));
  if (missing.length === 0) return [];

  const inserted = await insertProposedAdjustments(missing);
  const insertedKeys = new Set(inserted.map(keyOf));
  return missing.filter((proposal) => insertedKeys.has(keyOf(proposal)));
}

export async function runScoreCalibration(
  input: RunScoreCalibrationInput = {}
): Promise<RunScoreCalibrationResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const rows = await listEvaluatedCorpusWithEvaluations({
    workspaceId: input.workspaceId,
    clientProfileId: input.clientProfileId,
    cohort: input.cohort,
  });

  const comparisons = buildCalibrationComparisons(rows);
  const baseReport = buildCalibrationReport({ comparisons, capturedAt });
  const proposals = proposeAdjustments(comparisons);
  const persistedAdjustments = await persistProposedAdjustments(proposals);

  const dbProposed = await listProposedAdjustments({
    adjustmentVersion: RUBRIC_CALIBRATION_VERSION,
  });

  const report: CalibrationReport = {
    ...baseReport,
    adjustments: dbProposed.map(toAdjustmentProposalSummaryFromRow),
  };

  return { report, persistedAdjustments };
}

export type { CalibrationReport } from "./report";
export type { ProposedAdjustment } from "./adjustments";
