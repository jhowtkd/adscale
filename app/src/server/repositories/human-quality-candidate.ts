import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import {
  humanQualityCorpusCandidates,
  type HumanQualityCorpusCandidate,
  type NewHumanQualityCorpusCandidate,
} from "../db/schema";
import { sanitizeCorpusPayloads } from "../human-quality/corpus";
import type { HumanQualitySourceLabel } from "../human-quality/corpus";

export interface InsertCorpusCandidateInput
  extends Omit<
    NewHumanQualityCorpusCandidate,
    | "id"
    | "promotedCorpusItemId"
    | "promotedAt"
    | "capturedAt"
    | "createdAt"
    | "updatedAt"
    | "artifactRef"
    | "qualitySnapshot"
  > {
  artifactRef: Record<string, unknown>;
  qualitySnapshot: Record<string, unknown>;
}

export async function findCorpusCandidateByDerivationVersion(
  workspaceId: string,
  derivationId: string,
  corpusVersion: number
): Promise<HumanQualityCorpusCandidate | null> {
  const rows = await db
    .select()
    .from(humanQualityCorpusCandidates)
    .where(
      and(
        eq(humanQualityCorpusCandidates.workspaceId, workspaceId),
        eq(humanQualityCorpusCandidates.derivationId, derivationId),
        eq(humanQualityCorpusCandidates.corpusVersion, corpusVersion)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

export async function getCorpusCandidateById(
  candidateId: string
): Promise<HumanQualityCorpusCandidate | null> {
  const rows = await db
    .select()
    .from(humanQualityCorpusCandidates)
    .where(eq(humanQualityCorpusCandidates.id, candidateId))
    .limit(1);

  return rows[0] ?? null;
}

export async function insertCorpusCandidate(
  input: InsertCorpusCandidateInput
): Promise<HumanQualityCorpusCandidate> {
  const sanitized = sanitizeCorpusPayloads({
    artifactRef: input.artifactRef,
    qualitySnapshot: input.qualitySnapshot,
  });

  const [candidate] = await db
    .insert(humanQualityCorpusCandidates)
    .values({
      ...input,
      artifactRef: sanitized.artifactRef,
      qualitySnapshot: sanitized.qualitySnapshot,
    })
    .returning();

  return candidate;
}

export async function markCorpusCandidatePromoted(
  candidateId: string,
  corpusItemId: string
): Promise<HumanQualityCorpusCandidate | null> {
  const [candidate] = await db
    .update(humanQualityCorpusCandidates)
    .set({
      promotedCorpusItemId: corpusItemId,
      promotedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(humanQualityCorpusCandidates.id, candidateId))
    .returning();

  return candidate ?? null;
}

export interface ListCorpusCandidatesFilters {
  workspaceId?: string;
  sourceLabel?: HumanQualitySourceLabel;
  unpromotedOnly?: boolean;
  limit?: number;
}

const DEFAULT_CANDIDATE_LIST_LIMIT = 50;

export async function listCorpusCandidates(
  filters: ListCorpusCandidatesFilters = {}
): Promise<HumanQualityCorpusCandidate[]> {
  const conditions = [];
  const unpromotedOnly = filters.unpromotedOnly ?? true;

  if (filters.workspaceId) {
    conditions.push(eq(humanQualityCorpusCandidates.workspaceId, filters.workspaceId));
  }
  if (filters.sourceLabel) {
    conditions.push(eq(humanQualityCorpusCandidates.sourceLabel, filters.sourceLabel));
  }
  if (unpromotedOnly) {
    conditions.push(isNull(humanQualityCorpusCandidates.promotedCorpusItemId));
  }

  return db
    .select()
    .from(humanQualityCorpusCandidates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(humanQualityCorpusCandidates.capturedAt))
    .limit(filters.limit ?? DEFAULT_CANDIDATE_LIST_LIMIT);
}
