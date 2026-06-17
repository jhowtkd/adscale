import { listEvaluatedCorpusWithEvaluations } from "../../repositories/human-quality-corpus";
import {
  findProposedAdjustmentBySlice,
  insertProposedAdjustment,
} from "../../repositories/rubric-calibration-adjustments";
import {
  proposeAdjustments,
  toAdjustmentProposalSummaries,
  type ProposedAdjustment,
} from "./adjustments";
import { buildCalibrationComparisons } from "./compare";
import {
  buildCalibrationReport,
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

  const report: CalibrationReport = {
    ...baseReport,
    adjustments: toAdjustmentProposalSummaries(proposals),
  };

  return { report, persistedAdjustments };
}

export type { CalibrationReport } from "./report";
export type { ProposedAdjustment } from "./adjustments";
