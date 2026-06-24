import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db";
import {
  humanQualityFeedbackArtifacts,
  type HumanQualityFeedbackArtifact,
  type NewHumanQualityFeedbackArtifact,
} from "../db/schema";
import type { HumanQualityFeedbackArtifactPayload } from "../human-quality/feedback-artifact";
import type { HumanQualityCorpusCohort, HumanQualitySourceLabel } from "../human-quality/corpus";
import { emptySourceComposition } from "../human-quality/global-evidence";

export interface InsertFeedbackArtifactInput
  extends Omit<NewHumanQualityFeedbackArtifact, "id" | "createdAt" | "payload"> {
  payload: HumanQualityFeedbackArtifactPayload;
}

export async function findEvaluationByCorpusItemId(
  corpusItemId: string
): Promise<{ id: string } | null> {
  const { humanQualityEvaluations } = await import("../db/schema");
  const rows = await db
    .select({ id: humanQualityEvaluations.id })
    .from(humanQualityEvaluations)
    .where(eq(humanQualityEvaluations.corpusItemId, corpusItemId))
    .limit(1);

  return rows[0] ?? null;
}

export async function insertFeedbackArtifact(
  input: InsertFeedbackArtifactInput
): Promise<HumanQualityFeedbackArtifact> {
  const [artifact] = await db
    .insert(humanQualityFeedbackArtifacts)
    .values({
      ...input,
      payload: input.payload,
    })
    .returning();

  return artifact;
}

export async function listFeedbackArtifactIdsByCorpusItemIds(
  corpusItemIds: string[]
): Promise<Map<string, string>> {
  if (corpusItemIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({
      id: humanQualityFeedbackArtifacts.id,
      corpusItemId: humanQualityFeedbackArtifacts.corpusItemId,
    })
    .from(humanQualityFeedbackArtifacts)
    .where(inArray(humanQualityFeedbackArtifacts.corpusItemId, corpusItemIds));

  return new Map(rows.map((row) => [row.corpusItemId, row.id]));
}

export async function countFeedbackArtifactsBySourceLabel(filters: {
  workspaceId?: string;
  cohort?: HumanQualityCorpusCohort;
} = {}): Promise<Record<HumanQualitySourceLabel, number>> {
  const conditions = [];
  if (filters.workspaceId) {
    conditions.push(eq(humanQualityFeedbackArtifacts.workspaceId, filters.workspaceId));
  }
  if (filters.cohort) {
    conditions.push(eq(humanQualityFeedbackArtifacts.cohort, filters.cohort));
  }

  const rows = await db
    .select({
      sourceLabel: humanQualityFeedbackArtifacts.sourceLabel,
      count: sql<number>`count(*)::int`,
    })
    .from(humanQualityFeedbackArtifacts)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(humanQualityFeedbackArtifacts.sourceLabel);

  const composition = emptySourceComposition();
  for (const row of rows) {
    const label = row.sourceLabel as HumanQualitySourceLabel;
    if (label in composition) {
      composition[label] = row.count;
    }
  }

  return composition;
}
