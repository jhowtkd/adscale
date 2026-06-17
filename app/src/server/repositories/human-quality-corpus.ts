import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import {
  humanQualityCorpusItems,
  humanQualityEvaluations,
  type HumanQualityCorpusItem,
  type HumanQualityEvaluation,
  type NewHumanQualityCorpusItem,
} from "../db/schema";
import type {
  HumanQualityFailureReason,
  HumanQualityIntent,
} from "../human-quality/corpus";
import {
  sanitizeCorpusPayloads,
} from "../human-quality/corpus";
import type { EvaluatedCorpusRow } from "../human-quality/calibration/types";

export type { EvaluatedCorpusRow };

export interface InsertCorpusItemInput
  extends Omit<
    NewHumanQualityCorpusItem,
    | "id"
    | "status"
    | "selectedAt"
    | "createdAt"
    | "updatedAt"
    | "artifactRef"
    | "qualitySnapshot"
  > {
  artifactRef: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
}

export interface ListPendingCorpusItemsFilters {
  workspaceId: string;
  limit?: number;
}

export interface SubmitCorpusEvaluationInput {
  workspaceId: string;
  corpusItemId: string;
  reviewerUserId: string;
  visualScore: number;
  factualPass: boolean;
  intent: HumanQualityIntent;
  primaryFailureReason: HumanQualityFailureReason;
  otherReasonText?: string | null;
  notes?: string | null;
}

export interface SubmitCorpusEvaluationResult {
  item: HumanQualityCorpusItem;
  evaluation: HumanQualityEvaluation;
}

export interface ListEvaluatedCorpusWithEvaluationsFilters {
  workspaceId?: string;
  cohort?: string;
  limit?: number;
}

export interface CorpusStatusCount {
  pending: number;
  evaluated: number;
}

export interface CorpusOperationsProgress {
  totalPending: number;
  totalEvaluated: number;
  byCohort: Record<string, CorpusStatusCount>;
  byGenerationMode: Record<string, CorpusStatusCount>;
  byFormat: Record<string, CorpusStatusCount>;
  byCampaign: Record<string, CorpusStatusCount>;
  latestSelectedAt: Date | null;
  latestEvaluatedAt: Date | null;
}

const DEFAULT_EVALUATED_CORPUS_LIMIT = 500;

/** Create a pending corpus item with sanitized bounded payloads. */
export async function insertCorpusItem(
  input: InsertCorpusItemInput
): Promise<HumanQualityCorpusItem> {
  const sanitized = sanitizeCorpusPayloads({
    artifactRef: input.artifactRef,
    qualitySnapshot: input.qualitySnapshot,
  });

  const [item] = await db
    .insert(humanQualityCorpusItems)
    .values({
      ...input,
      artifactRef: sanitized.artifactRef,
      qualitySnapshot: sanitized.qualitySnapshot,
      status: "pending",
    })
    .returning();

  return item;
}

export async function getCorpusItemById(
  workspaceId: string,
  corpusItemId: string
): Promise<HumanQualityCorpusItem | null> {
  const rows = await db
    .select()
    .from(humanQualityCorpusItems)
    .where(
      and(
        eq(humanQualityCorpusItems.id, corpusItemId),
        eq(humanQualityCorpusItems.workspaceId, workspaceId)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function findCorpusItemByDerivationVersion(
  workspaceId: string,
  derivationId: string,
  corpusVersion: number
): Promise<HumanQualityCorpusItem | null> {
  const rows = await db
    .select()
    .from(humanQualityCorpusItems)
    .where(
      and(
        eq(humanQualityCorpusItems.workspaceId, workspaceId),
        eq(humanQualityCorpusItems.derivationId, derivationId),
        eq(humanQualityCorpusItems.corpusVersion, corpusVersion)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function listPendingCorpusItems(
  filters: ListPendingCorpusItemsFilters
): Promise<HumanQualityCorpusItem[]> {
  return db
    .select()
    .from(humanQualityCorpusItems)
    .where(
      and(
        eq(humanQualityCorpusItems.workspaceId, filters.workspaceId),
        eq(humanQualityCorpusItems.status, "pending")
      )
    )
    .orderBy(desc(humanQualityCorpusItems.selectedAt))
    .limit(filters.limit ?? 50);
}

/** Join evaluated corpus items with their human evaluations for calibration rollup. */
export async function listEvaluatedCorpusWithEvaluations(
  filters: ListEvaluatedCorpusWithEvaluationsFilters = {}
): Promise<EvaluatedCorpusRow[]> {
  const conditions = [eq(humanQualityCorpusItems.status, "evaluated")];

  if (filters.workspaceId) {
    conditions.push(eq(humanQualityCorpusItems.workspaceId, filters.workspaceId));
  }

  if (filters.cohort) {
    conditions.push(eq(humanQualityCorpusItems.cohort, filters.cohort));
  }

  return db
    .select({
      item: humanQualityCorpusItems,
      evaluation: humanQualityEvaluations,
    })
    .from(humanQualityCorpusItems)
    .innerJoin(
      humanQualityEvaluations,
      eq(humanQualityEvaluations.corpusItemId, humanQualityCorpusItems.id)
    )
    .where(and(...conditions))
    .orderBy(desc(humanQualityCorpusItems.selectedAt))
    .limit(filters.limit ?? DEFAULT_EVALUATED_CORPUS_LIMIT);
}

export async function submitCorpusEvaluation(
  input: SubmitCorpusEvaluationInput
): Promise<SubmitCorpusEvaluationResult> {
  const [evaluation] = await db
    .insert(humanQualityEvaluations)
    .values({
      workspaceId: input.workspaceId,
      corpusItemId: input.corpusItemId,
      reviewerUserId: input.reviewerUserId,
      visualScore: input.visualScore,
      factualPass: input.factualPass,
      intent: input.intent,
      primaryFailureReason: input.primaryFailureReason,
      otherReasonText: input.otherReasonText?.slice(0, 500) ?? null,
      notes: input.notes?.slice(0, 2000) ?? null,
    })
    .returning();

  const [item] = await db
    .update(humanQualityCorpusItems)
    .set({
      status: "evaluated",
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(humanQualityCorpusItems.id, input.corpusItemId),
        eq(humanQualityCorpusItems.workspaceId, input.workspaceId)
      )
    )
    .returning();

  return { item, evaluation };
}

function bumpStatusCount(
  buckets: Record<string, CorpusStatusCount>,
  key: string,
  status: "pending" | "evaluated"
): void {
  if (!buckets[key]) {
    buckets[key] = { pending: 0, evaluated: 0 };
  }
  buckets[key][status] += 1;
}

/** Summarize pending/evaluated corpus rows for operational queue progress. */
export async function getCorpusOperationsProgress(
  workspaceId: string
): Promise<CorpusOperationsProgress> {
  const rows = await db
    .select({
      status: humanQualityCorpusItems.status,
      cohort: humanQualityCorpusItems.cohort,
      generationMode: humanQualityCorpusItems.generationMode,
      format: humanQualityCorpusItems.format,
      campaignId: humanQualityCorpusItems.campaignId,
      selectedAt: humanQualityCorpusItems.selectedAt,
      updatedAt: humanQualityCorpusItems.updatedAt,
    })
    .from(humanQualityCorpusItems)
    .where(
      and(
        eq(humanQualityCorpusItems.workspaceId, workspaceId),
        inArray(humanQualityCorpusItems.status, ["pending", "evaluated"])
      )
    );

  const progress: CorpusOperationsProgress = {
    totalPending: 0,
    totalEvaluated: 0,
    byCohort: {},
    byGenerationMode: {},
    byFormat: {},
    byCampaign: {},
    latestSelectedAt: null,
    latestEvaluatedAt: null,
  };

  for (const row of rows) {
    const status = row.status as "pending" | "evaluated";
    if (status === "pending") {
      progress.totalPending += 1;
    } else {
      progress.totalEvaluated += 1;
    }

    bumpStatusCount(progress.byCohort, row.cohort, status);
    bumpStatusCount(progress.byGenerationMode, row.generationMode, status);
    bumpStatusCount(progress.byFormat, row.format || "unknown", status);
    bumpStatusCount(progress.byCampaign, row.campaignId, status);

    if (
      !progress.latestSelectedAt ||
      row.selectedAt.getTime() > progress.latestSelectedAt.getTime()
    ) {
      progress.latestSelectedAt = row.selectedAt;
    }

    if (status === "evaluated") {
      if (
        !progress.latestEvaluatedAt ||
        row.updatedAt.getTime() > progress.latestEvaluatedAt.getTime()
      ) {
        progress.latestEvaluatedAt = row.updatedAt;
      }
    }
  }

  return progress;
}
