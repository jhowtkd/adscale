import { listEvaluatedCorpusWithEvaluations } from "../../repositories/human-quality-corpus";
import { buildQualityTrendReport } from "./report";
import type { QualityTrendReport } from "./types";

/** Matches DEFAULT_EVALUATED_CORPUS_LIMIT — raise only with explicit product sign-off. */
export const TREND_MAX_ROWS = 500;

export interface RunQualityTrendInput {
  workspaceId?: string;
  cohort?: string;
  generationMode?: string;
  format?: string;
  clientProfileId?: string;
  primaryFailureReason?: string;
  capturedAt?: string;
}

export interface RunQualityTrendResult {
  report: QualityTrendReport;
}

export async function runQualityTrend(
  input: RunQualityTrendInput = {}
): Promise<RunQualityTrendResult> {
  const capturedAt = input.capturedAt ?? new Date().toISOString();

  const rows = await listEvaluatedCorpusWithEvaluations({
    workspaceId: input.workspaceId,
    cohort: input.cohort,
    generationMode: input.generationMode,
    format: input.format,
    clientProfileId: input.clientProfileId,
    primaryFailureReason: input.primaryFailureReason,
    limit: TREND_MAX_ROWS,
  });

  const truncated = rows.length >= TREND_MAX_ROWS;

  const report = buildQualityTrendReport({
    rows,
    capturedAt,
    ...(truncated ? { truncated: true } : {}),
  });

  return { report };
}

export type { QualityTrendReport } from "./types";
