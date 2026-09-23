import { and, desc, eq, gte, inArray, lt, lte, or, sql, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  humanQualityCorpusCandidates,
  humanQualityCorpusItems,
  humanQualityEvaluations,
  type HumanQualityCorpusItem,
  type HumanQualityEvaluation,
  type NewHumanQualityCorpusItem,
} from "../db/schema";
import type {
  HumanQualityFailureReason,
  HumanQualityIntent,
  HumanQualitySourceLabel,
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
  workspaceId?: string;
  limit?: number;
}

export interface ListCorpusQueueFilters {
  workspaceId?: string;
  clientProfileId?: string;
  campaignId?: string;
  generationMode?: string;
  format?: string;
  cohort?: string;
  status?: string;
  sourceLabel?: HumanQualitySourceLabel;
  selectedAfter?: Date;
  selectedBefore?: Date;
  cursor?: { selectedAt: Date; id: string };
  limit?: number;
}

export interface CorpusQueueCursor {
  selectedAt: string;
  id: string;
}

export interface ListCorpusQueueResult {
  items: CorpusQueueListRow[];
  nextCursor: CorpusQueueCursor | null;
}

export interface CorpusQueueListRow {
  item: HumanQualityCorpusItem;
  sourceLabel: HumanQualitySourceLabel;
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
  generationMode?: string;
  format?: string;
  clientProfileId?: string;
  primaryFailureReason?: string;
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

export async function getCorpusItemByIdAnyWorkspace(
  corpusItemId: string
): Promise<HumanQualityCorpusItem | null> {
  const rows = await db
    .select()
    .from(humanQualityCorpusItems)
    .where(eq(humanQualityCorpusItems.id, corpusItemId))
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
  const { items: rows } = await listCorpusQueueItems({
    workspaceId: filters.workspaceId,
    status: "pending",
    limit: filters.limit,
  });
  return rows.map((row) => row.item);
}

function buildCorpusQueueConditions(filters: ListCorpusQueueFilters) {
  const conditions = [];

  if (filters.status) {
    conditions.push(eq(humanQualityCorpusItems.status, filters.status));
  }

  if (filters.workspaceId) {
    conditions.push(eq(humanQualityCorpusItems.workspaceId, filters.workspaceId));
  }
  if (filters.clientProfileId) {
    conditions.push(eq(humanQualityCorpusItems.clientProfileId, filters.clientProfileId));
  }
  if (filters.campaignId) {
    conditions.push(eq(humanQualityCorpusItems.campaignId, filters.campaignId));
  }
  if (filters.generationMode) {
    conditions.push(eq(humanQualityCorpusItems.generationMode, filters.generationMode));
  }
  if (filters.format) {
    conditions.push(eq(humanQualityCorpusItems.format, filters.format));
  }
  if (filters.cohort) {
    conditions.push(eq(humanQualityCorpusItems.cohort, filters.cohort));
  }
  if (filters.selectedAfter) {
    conditions.push(gte(humanQualityCorpusItems.selectedAt, filters.selectedAfter));
  }
  if (filters.selectedBefore) {
    conditions.push(lte(humanQualityCorpusItems.selectedAt, filters.selectedBefore));
  }

  if (filters.sourceLabel) {
    if (filters.sourceLabel === "operator_imported") {
      conditions.push(
        or(
          isNull(humanQualityCorpusCandidates.id),
          eq(humanQualityCorpusCandidates.sourceLabel, "operator_imported")
        )!
      );
    } else {
      conditions.push(eq(humanQualityCorpusCandidates.sourceLabel, filters.sourceLabel));
    }
  }

  return conditions;
}

const corpusSourceLabelSql = sql<HumanQualitySourceLabel>`coalesce(${humanQualityCorpusCandidates.sourceLabel}, 'operator_imported')`;

export async function listCorpusQueueItems(
  filters: ListCorpusQueueFilters
): Promise<ListCorpusQueueResult> {
  const effectiveFilters: ListCorpusQueueFilters = {
    status: "pending",
    ...filters,
  };
  const conditions = buildCorpusQueueConditions(effectiveFilters);

  if (filters.cursor) {
    conditions.push(
      or(
        lt(humanQualityCorpusItems.selectedAt, filters.cursor.selectedAt),
        and(
          eq(humanQualityCorpusItems.selectedAt, filters.cursor.selectedAt),
          lt(humanQualityCorpusItems.id, filters.cursor.id)
        )
      )!
    );
  }

  const limit = filters.limit ?? 50;

  const rows = await db
    .select({
      item: humanQualityCorpusItems,
      sourceLabel: corpusSourceLabelSql,
    })
    .from(humanQualityCorpusItems)
    .leftJoin(
      humanQualityCorpusCandidates,
      and(
        eq(humanQualityCorpusCandidates.workspaceId, humanQualityCorpusItems.workspaceId),
        eq(humanQualityCorpusCandidates.derivationId, humanQualityCorpusItems.derivationId),
        eq(humanQualityCorpusCandidates.corpusVersion, humanQualityCorpusItems.corpusVersion)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(humanQualityCorpusItems.selectedAt), desc(humanQualityCorpusItems.id))
    .limit(limit);

  const items = rows.map((row) => ({
    item: row.item,
    sourceLabel: row.sourceLabel,
  }));

  const last = items[items.length - 1];
  const nextCursor =
    items.length === limit && last
      ? {
          selectedAt: last.item.selectedAt.toISOString(),
          id: last.item.id,
        }
      : null;

  return { items, nextCursor };
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

  if (filters.generationMode) {
    conditions.push(
      eq(humanQualityCorpusItems.generationMode, filters.generationMode)
    );
  }

  if (filters.format) {
    conditions.push(eq(humanQualityCorpusItems.format, filters.format));
  }

  if (filters.clientProfileId) {
    conditions.push(
      eq(humanQualityCorpusItems.clientProfileId, filters.clientProfileId)
    );
  }

  if (filters.primaryFailureReason) {
    conditions.push(
      eq(
        humanQualityEvaluations.primaryFailureReason,
        filters.primaryFailureReason
      )
    );
  }

  return db
    .select({
      item: humanQualityCorpusItems,
      evaluation: humanQualityEvaluations,
      sourceLabel: corpusSourceLabelSql,
    })
    .from(humanQualityCorpusItems)
    .innerJoin(
      humanQualityEvaluations,
      eq(humanQualityEvaluations.corpusItemId, humanQualityCorpusItems.id)
    )
    .leftJoin(
      humanQualityCorpusCandidates,
      and(
        eq(humanQualityCorpusCandidates.workspaceId, humanQualityCorpusItems.workspaceId),
        eq(humanQualityCorpusCandidates.derivationId, humanQualityCorpusItems.derivationId),
        eq(humanQualityCorpusCandidates.corpusVersion, humanQualityCorpusItems.corpusVersion)
      )
    )
    .where(and(...conditions))
    .orderBy(desc(humanQualityCorpusItems.selectedAt))
    .limit(filters.limit ?? DEFAULT_EVALUATED_CORPUS_LIMIT)
    .then((rows) =>
      rows.map((row) => ({
        item: row.item,
        evaluation: row.evaluation,
        sourceLabel: row.sourceLabel,
      }))
    );
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

/** Summarize pending/evaluated corpus rows for operational queue progress. */
export async function getCorpusOperationsProgress(
  workspaceId?: string,
  filters: Omit<ListCorpusQueueFilters, "limit" | "status"> = {}
): Promise<CorpusOperationsProgress> {
  const conditions = buildCorpusQueueConditions({
    ...filters,
    workspaceId: filters.workspaceId ?? workspaceId,
  });
  conditions.push(inArray(humanQualityCorpusItems.status, ["pending", "evaluated"]));

  const rows = await db.execute(sql`
    SELECT
      grouping(
        ${humanQualityCorpusItems.cohort},
        ${humanQualityCorpusItems.generationMode},
        ${humanQualityCorpusItems.format},
        ${humanQualityCorpusItems.campaignId}
      )::int AS grouping_mask,
      ${humanQualityCorpusItems.cohort} AS cohort,
      ${humanQualityCorpusItems.generationMode} AS generation_mode,
      ${humanQualityCorpusItems.format} AS format,
      ${humanQualityCorpusItems.campaignId} AS campaign_id,
      count(*) FILTER (WHERE ${humanQualityCorpusItems.status} = 'pending')::int AS pending_count,
      count(*) FILTER (WHERE ${humanQualityCorpusItems.status} = 'evaluated')::int AS evaluated_count,
      max(extract(epoch from ${humanQualityCorpusItems.selectedAt}) * 1000) AS latest_selected_ms,
      max(extract(epoch from ${humanQualityCorpusItems.updatedAt}) * 1000) FILTER (
        WHERE ${humanQualityCorpusItems.status} = 'evaluated'
      ) AS latest_evaluated_ms
    FROM ${humanQualityCorpusItems}
    LEFT JOIN ${humanQualityCorpusCandidates}
      ON ${and(
        eq(humanQualityCorpusCandidates.workspaceId, humanQualityCorpusItems.workspaceId),
        eq(humanQualityCorpusCandidates.derivationId, humanQualityCorpusItems.derivationId),
        eq(humanQualityCorpusCandidates.corpusVersion, humanQualityCorpusItems.corpusVersion)
      )}
    WHERE ${and(...conditions)}
    GROUP BY GROUPING SETS (
      (),
      (${humanQualityCorpusItems.cohort}),
      (${humanQualityCorpusItems.generationMode}),
      (${humanQualityCorpusItems.format}),
      (${humanQualityCorpusItems.campaignId})
    )
  `);

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

  for (const row of rows.rows) {
    const counts = {
      pending: Number(row.pending_count),
      evaluated: Number(row.evaluated_count),
    };
    switch (Number(row.grouping_mask)) {
      case 15:
        progress.totalPending = counts.pending;
        progress.totalEvaluated = counts.evaluated;
        progress.latestSelectedAt = row.latest_selected_ms !== null
          ? new Date(Number(row.latest_selected_ms)) : null;
        progress.latestEvaluatedAt = row.latest_evaluated_ms !== null
          ? new Date(Number(row.latest_evaluated_ms)) : null;
        break;
      case 7:
        progress.byCohort[String(row.cohort)] = counts;
        break;
      case 11:
        progress.byGenerationMode[String(row.generation_mode)] = counts;
        break;
      case 13:
        progress.byFormat[String(row.format || "unknown")] = counts;
        break;
      case 14:
        progress.byCampaign[String(row.campaign_id)] = counts;
        break;
    }
  }

  return progress;
}
