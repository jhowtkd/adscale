import { and, desc, eq, inArray, not } from "drizzle-orm";
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

  const draftKeys = new Set(input.drafts.map((draft) => draftIdentityKey(draft)));

  const removed: ClientOutputLearning[] = [];
  const upserted: ClientOutputLearning[] = [];

  return db.transaction(async (tx) => {
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

    for (const draft of input.drafts) {
      const existingRow = existing.find(
        (row) => rowIdentityKey(row) === draftIdentityKey(draft)
      );

      let status = draft.status;
      if (
        existingRow?.status === "approved" &&
        draft.status === "superseded"
      ) {
        status = "superseded";
      } else if (
        existingRow?.status === "superseded" &&
        draft.status === "approved"
      ) {
        status = "approved";
      }

      const payload: NewClientOutputLearning = {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        variableKey: draft.variableKey,
        variableValue: draft.variableValue,
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
        status,
        lastEvidenceAt: draft.lastEvidenceAt,
        approvedAt: status === "approved" ? new Date() : null,
        updatedAt: new Date(),
      };

      const [row] = await tx
        .insert(clientOutputLearnings)
        .values(payload)
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
            preferenceDirection: payload.preferenceDirection,
            statement: payload.statement,
            confidence: payload.confidence,
            confidenceScore: payload.confidenceScore,
            sampleEventCount: payload.sampleEventCount,
            sampleCampaignCount: payload.sampleCampaignCount,
            supportingEvidence: payload.supportingEvidence,
            contradictingEvidence: payload.contradictingEvidence,
            algorithmVersion: payload.algorithmVersion,
            status: payload.status,
            lastEvidenceAt: payload.lastEvidenceAt,
            approvedAt:
              payload.status === "approved"
                ? new Date()
                : payload.status === "superseded" || payload.status === "draft"
                  ? null
                  : undefined,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (row) upserted.push(row);
    }

    return { upserted, removed };
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
