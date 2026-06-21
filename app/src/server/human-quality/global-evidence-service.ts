import {
  getCorpusOperationsProgress,
  listEvaluatedCorpusWithEvaluations,
} from "../repositories/human-quality-corpus";
import { countFeedbackArtifactsBySourceLabel } from "../repositories/human-quality-feedback-artifact";
import type { HumanQualityCorpusCohort } from "./corpus";
import {
  buildGlobalCorpusEvidenceReport,
  emptySourceComposition,
  groupEvaluationsByClientProfile,
  type GlobalCorpusEvidenceReport,
} from "./global-evidence";
import { runSampleCoverage } from "./sampling/service";

export interface RunGlobalCorpusEvidenceInput {
  cohort?: HumanQualityCorpusCohort;
  capturedAt?: string;
}

export interface RunGlobalCorpusEvidenceResult {
  report: GlobalCorpusEvidenceReport;
}

export async function runGlobalCorpusEvidence(
  input: RunGlobalCorpusEvidenceInput = {}
): Promise<RunGlobalCorpusEvidenceResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  const filterOpts = { cohort: input.cohort };

  const [progress, sourceComposition, coverageResult, evaluatedRows] = await Promise.all([
    getCorpusOperationsProgress(undefined, filterOpts),
    countFeedbackArtifactsBySourceLabel(filterOpts).catch(() => emptySourceComposition()),
    runSampleCoverage({ cohort: input.cohort, capturedAt }),
    listEvaluatedCorpusWithEvaluations(filterOpts),
  ]);

  const report = buildGlobalCorpusEvidenceReport({
    capturedAt,
    evaluatedItemCount: progress.totalEvaluated,
    pendingItemCount: progress.totalPending,
    sourceComposition,
    sampleCoverage: coverageResult.report,
    brandTasteClientScopes: groupEvaluationsByClientProfile(evaluatedRows),
  });

  return { report };
}
