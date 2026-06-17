import { listEvaluatedCorpusWithEvaluations } from "../../repositories/human-quality-corpus";
import { buildImpactRows } from "./enrich";
import {
  buildLearningImpactReport,
  type LearningImpactReport,
} from "./report";

const DEFAULT_IMPACT_ROW_LIMIT = 500;

export interface RunLearningImpactInput {
  workspaceId?: string;
  cohort?: string;
  capturedAt?: string;
}

export interface RunLearningImpactResult {
  report: LearningImpactReport;
}

export async function runLearningImpact(
  input: RunLearningImpactInput = {}
): Promise<RunLearningImpactResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const evaluatedRows = await listEvaluatedCorpusWithEvaluations({
    workspaceId: input.workspaceId,
    cohort: input.cohort,
    limit: DEFAULT_IMPACT_ROW_LIMIT,
  });

  const enriched = buildImpactRows(evaluatedRows);
  const report = buildLearningImpactReport({
    rows: enriched.rows,
    unlabeledCount: enriched.unlabeledCount,
    capturedAt,
  });

  return { report };
}

export type { LearningImpactReport } from "./report";
