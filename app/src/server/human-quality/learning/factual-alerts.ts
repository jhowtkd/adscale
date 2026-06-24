import type { EvaluatedCorpusRow, FactualIssueAlert } from "../calibration/types";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import {
  buildLearningSliceBuckets,
  meetsLearningSliceThresholds,
} from "./aggregate";

export interface ListFactualIssueAlertsFilters {
  workspaceId?: string;
  clientProfileId?: string;
}

export function buildFactualIssueAlerts(rows: EvaluatedCorpusRow[]): FactualIssueAlert[] {
  const alerts: FactualIssueAlert[] = [];

  for (const bucket of buildLearningSliceBuckets(rows)) {
    if (bucket.primaryFailureReason !== "factual_issue") {
      continue;
    }

    if (!meetsLearningSliceThresholds(bucket)) {
      continue;
    }

    const evidenceRefs: FactualIssueAlert["evidenceRefs"] = {
      corpusItemIds: bucket.corpusItemIds,
      stats: {
        count: bucket.stats.count,
        meanSignedDelta: bucket.stats.meanSignedDelta,
        meanAbsError: bucket.stats.meanAbsError,
        overScoreCount: bucket.stats.overScoreCount,
        underScoreCount: bucket.stats.underScoreCount,
      },
    };

    if (bucket.artifactIds.length > 0) {
      evidenceRefs.artifactIds = bucket.artifactIds;
    }

    alerts.push({
      workspaceId: bucket.workspaceId,
      clientProfileId: bucket.clientProfileId,
      sliceKey: bucket.sliceKey,
      evidenceRefs,
      rationale: "factual_guard_review_required",
    });
  }

  return alerts;
}

export async function listFactualIssueAlerts(
  filters: ListFactualIssueAlertsFilters = {}
): Promise<FactualIssueAlert[]> {
  const rows = await listEvaluatedCorpusWithEvaluations({
    workspaceId: filters.workspaceId,
    clientProfileId: filters.clientProfileId,
    primaryFailureReason: "factual_issue",
  });

  return buildFactualIssueAlerts(rows);
}
