import type { EvaluatedCorpusRow, FactualIssueAlert } from "../calibration/types";
import { listEvaluatedCorpusWithEvaluations } from "@/server/repositories/human-quality-corpus";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { equipeAccounts, equipeEvents } from "@/server/db/equipe-schema";
import { readRejectionClassificationEvidence, REJECTION_FACTUAL_ALERT_EVENT } from "@/server/equipe/module/rejection-classification-evidence";
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

  const alerts = buildFactualIssueAlerts(rows);
  const events = await db.select({ event: equipeEvents, clientProfileId: equipeAccounts.clientProfileId })
    .from(equipeEvents).innerJoin(equipeAccounts, and(
      eq(equipeAccounts.id, equipeEvents.accountId), eq(equipeAccounts.workspaceId, equipeEvents.workspaceId),
    )).where(and(
      eq(equipeEvents.eventType, REJECTION_FACTUAL_ALERT_EVENT),
      filters.workspaceId ? eq(equipeEvents.workspaceId, filters.workspaceId) : undefined,
      filters.clientProfileId ? eq(equipeAccounts.clientProfileId, filters.clientProfileId) : undefined,
    ));
  for (const { event, clientProfileId } of events) {
    const evidence = readRejectionClassificationEvidence(event, clientProfileId);
    if (!evidence || evidence.category !== "fact" || !evidence.actorId || !evidence.actorRole) continue;
    alerts.push({ workspaceId: event.workspaceId, clientProfileId, sliceKey: `equipe:${evidence.sourceEventId}`,
      rationale: "factual_guard_review_required", evidenceRefs: { corpusItemIds: [],
        equipeEventRefs: [{ sourceEventId: evidence.sourceEventId, itemId: evidence.itemId, roundId: evidence.roundId,
          actorId: evidence.actorId, actorRole: evidence.actorRole, category: "fact", evidence: evidence.evidence }],
        stats: { count: 1, meanSignedDelta: null, meanAbsError: null, overScoreCount: 0, underScoreCount: 0 },
      } });
  }
  return alerts;
}
