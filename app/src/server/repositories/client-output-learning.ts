import { and, desc, eq, inArray, not, sql } from "drizzle-orm";
import { db } from "../db";
import {
  clientOutputLearnings,
  type ClientOutputLearning,
  type NewClientOutputLearning,
} from "../db/schema";
import type { DerivedOutputLearningDraft } from "../output-learning/types";
import { OUTPUT_LEARNING_ALGORITHM_VERSION } from "../output-learning/types";

function draftIdentityKey(draft: DerivedOutputLearningDraft): string {
  return `${draft.variableKey}::${draft.variableValue.toLowerCase()}::${draft.scopeGenerationMode}::${draft.scopeFormat}`;
}

function rowIdentityKey(row: ClientOutputLearning): string {
  return `${row.variableKey}::${row.variableValue.toLowerCase()}::${row.scopeGenerationMode}::${row.scopeFormat}`;
}

export async function listOutputLearningsByClientProfile(
  clientProfileId: string,
  workspaceId: string,
  options?: { status?: string }
): Promise<ClientOutputLearning[]> {
  const conditions = [
    eq(clientOutputLearnings.clientProfileId, clientProfileId),
    eq(clientOutputLearnings.workspaceId, workspaceId),
    not(eq(clientOutputLearnings.status, "removed")),
  ];

  if (options?.status) {
    conditions.push(eq(clientOutputLearnings.status, options.status));
  }

  return db
    .select()
    .from(clientOutputLearnings)
    .where(and(...conditions))
    .orderBy(desc(clientOutputLearnings.lastEvidenceAt));
}

export async function getOutputLearningById(
  id: string,
  workspaceId: string
): Promise<ClientOutputLearning | null> {
  const [row] = await db
    .select()
    .from(clientOutputLearnings)
    .where(
      and(
        eq(clientOutputLearnings.id, id),
        eq(clientOutputLearnings.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getOutputLearningsByIds(
  ids: string[],
  workspaceId: string
): Promise<ClientOutputLearning[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(clientOutputLearnings)
    .where(
      and(
        inArray(clientOutputLearnings.id, ids),
        eq(clientOutputLearnings.workspaceId, workspaceId),
        not(eq(clientOutputLearnings.status, "removed"))
      )
    );
}

export async function syncOutputLearningsForClient(input: {
  workspaceId: string;
  clientProfileId: string;
  drafts: DerivedOutputLearningDraft[];
}): Promise<{
  upserted: ClientOutputLearning[];
  removed: ClientOutputLearning[];
}> {
  const existing = await listOutputLearningsByClientProfile(
    input.clientProfileId,
    input.workspaceId
  );
  const existingByKey = new Map(existing.map((row) => [rowIdentityKey(row), row]));
  const draftsByKey = new Map(
    input.drafts.map((draft) => [draftIdentityKey(draft), draft])
  );
  const draftKeys = new Set(draftsByKey.keys());

  return db.transaction(async (tx) => {
    const removed: ClientOutputLearning[] = [];
    const idsToRemove = existing
      .filter((row) => !draftKeys.has(rowIdentityKey(row)) && row.status !== "removed")
      .map((row) => row.id);
    if (idsToRemove.length > 0) {
      const removedRows = await tx
        .update(clientOutputLearnings)
        .set({ status: "removed", updatedAt: new Date() })
        .where(inArray(clientOutputLearnings.id, idsToRemove))
        .returning();
      removed.push(...removedRows);
    }

    const payloads: NewClientOutputLearning[] = [...draftsByKey.values()].map(
      (draft) => {
        const existingRow = existingByKey.get(draftIdentityKey(draft));
        return {
          workspaceId: input.workspaceId,
          clientProfileId: input.clientProfileId,
          variableKey: draft.variableKey,
          variableValue: existingRow?.variableValue ?? draft.variableValue,
          scopeGenerationMode: draft.scopeGenerationMode,
          scopeFormat: draft.scopeFormat,
          preferenceDirection: draft.preferenceDirection,
          statement: draft.statement,
          confidence: draft.confidence,
          confidenceScore: draft.confidenceScore,
          sampleEventCount: draft.sampleEventCount,
          sampleCampaignCount: draft.sampleCampaignCount,
          supportingEvidence: draft.supportingEvidence,
          contradictingEvidence: draft.contradictingEvidence,
          algorithmVersion: OUTPUT_LEARNING_ALGORITHM_VERSION,
          status: draft.status,
          lastEvidenceAt: draft.lastEvidenceAt,
          approvedAt: draft.status === "approved" ? new Date() : null,
          updatedAt: new Date(),
        };
      }
    );

    const rowsByKey = new Map<string, ClientOutputLearning>();
    for (let offset = 0; offset < payloads.length; offset += 100) {
      const rows = await tx
        .insert(clientOutputLearnings)
        .values(payloads.slice(offset, offset + 100))
        .onConflictDoUpdate({
          target: [
            clientOutputLearnings.workspaceId,
            clientOutputLearnings.clientProfileId,
            clientOutputLearnings.variableKey,
            clientOutputLearnings.variableValue,
            clientOutputLearnings.scopeGenerationMode,
            clientOutputLearnings.scopeFormat,
          ],
          set: {
            preferenceDirection: sql`excluded.preference_direction`,
            statement: sql`excluded.statement`,
            confidence: sql`excluded.confidence`,
            confidenceScore: sql`excluded.confidence_score`,
            sampleEventCount: sql`excluded.sample_event_count`,
            sampleCampaignCount: sql`excluded.sample_campaign_count`,
            supportingEvidence: sql`excluded.supporting_evidence`,
            contradictingEvidence: sql`excluded.contradicting_evidence`,
            algorithmVersion: sql`excluded.algorithm_version`,
            status: sql`excluded.status`,
            lastEvidenceAt: sql`excluded.last_evidence_at`,
            approvedAt: sql`case when excluded.status = 'removed' then approved_at else excluded.approved_at end`,
            updatedAt: sql`excluded.updated_at`,
          },
        })
        .returning();
      for (const row of rows) rowsByKey.set(rowIdentityKey(row), row);
    }

    return {
      upserted: [...draftsByKey.keys()].flatMap((key) => {
        const row = rowsByKey.get(key);
        return row ? [row] : [];
      }),
      removed,
    };
  });
}

export async function updateOutputLearningMem0Id(
  learningId: string,
  workspaceId: string,
  mem0MemoryId: string | null
) {
  await db
    .update(clientOutputLearnings)
    .set({ mem0MemoryId, updatedAt: new Date() })
    .where(
      and(
        eq(clientOutputLearnings.id, learningId),
        eq(clientOutputLearnings.workspaceId, workspaceId)
      )
    );
}
