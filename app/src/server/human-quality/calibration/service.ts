import { listEvaluatedCorpusWithEvaluations } from "../../repositories/human-quality-corpus";
import {
  findProposedAdjustmentBySlice,
  insertProposedAdjustment,
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
  const persistedAdjustments: ProposedAdjustment[] = [];

  for (const proposal of proposals) {
    const existing = await findProposedAdjustmentBySlice(
      proposal.sliceKey,
      proposal.adjustmentVersion,
      proposal.targetModule,
      proposal.targetKey
    );

    if (existing) {
      continue;
    }

    await insertProposedAdjustment({
      adjustmentVersion: proposal.adjustmentVersion,
      targetModule: proposal.targetModule,
      targetKey: proposal.targetKey,
      sliceKey: proposal.sliceKey,
      rationale: proposal.rationale,
      evidenceRefs: proposal.evidenceRefs,
    });
    persistedAdjustments.push(proposal);
  }

  return persistedAdjustments;
}

export async function runScoreCalibration(
  input: RunScoreCalibrationInput = {}
): Promise<RunScoreCalibrationResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const rows = await listEvaluatedCorpusWithEvaluations({
    workspaceId: input.workspaceId,
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
