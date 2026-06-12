import { and, desc, eq, inArray, not } from "drizzle-orm";
import { db } from "../db";
import {
  campaigns,
  clientPerformanceLearnings,
  creativeHypotheses,
  derivations,
  hypothesisVariants,
  variantComparisons,
  type ClientPerformanceLearning,
  type NewClientPerformanceLearning,
} from "../db/schema";
import type { DerivedLearningDraft } from "../performance/learning/types";
import { LEARNING_ALGORITHM_VERSION } from "../performance/learning/types";

export async function listLearningsByClientProfile(
  clientProfileId: string,
  workspaceId: string,
  options?: { status?: string }
): Promise<ClientPerformanceLearning[]> {
  const conditions = [
    eq(clientPerformanceLearnings.clientProfileId, clientProfileId),
    eq(clientPerformanceLearnings.workspaceId, workspaceId),
    not(eq(clientPerformanceLearnings.status, "removed")),
  ];

  if (options?.status) {
    conditions.push(eq(clientPerformanceLearnings.status, options.status));
  }

  return db
    .select()
    .from(clientPerformanceLearnings)
    .where(and(...conditions))
    .orderBy(desc(clientPerformanceLearnings.lastEvidenceAt));
}

export async function getLearningById(
  id: string,
  workspaceId: string
): Promise<ClientPerformanceLearning | null> {
  const [row] = await db
    .select()
    .from(clientPerformanceLearnings)
    .where(
      and(
        eq(clientPerformanceLearnings.id, id),
        eq(clientPerformanceLearnings.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return row ?? null;
}

export async function getLearningsByIds(
  ids: string[],
  workspaceId: string
): Promise<ClientPerformanceLearning[]> {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(clientPerformanceLearnings)
    .where(
      and(
        inArray(clientPerformanceLearnings.id, ids),
        eq(clientPerformanceLearnings.workspaceId, workspaceId),
        not(eq(clientPerformanceLearnings.status, "removed"))
      )
    );
}

export async function listComparisonEvidenceInputsForClient(
  clientProfileId: string,
  workspaceId: string
) {
  const clientCampaigns = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      objective: campaigns.objective,
      generationMode: campaigns.generationMode,
      styleIntensity: campaigns.styleIntensity,
    })
    .from(campaigns)
    .where(
      and(
        eq(campaigns.clientProfileId, clientProfileId),
        eq(campaigns.workspaceId, workspaceId)
      )
    );

  if (clientCampaigns.length === 0) {
    return [];
  }

  const campaignIds = clientCampaigns.map((campaign) => campaign.id);
  const comparisons = await db
    .select()
    .from(variantComparisons)
    .where(
      and(
        eq(variantComparisons.workspaceId, workspaceId),
        inArray(variantComparisons.campaignId, campaignIds)
      )
    )
    .orderBy(desc(variantComparisons.createdAt));

  const hypothesisIds = [
    ...new Set(
      comparisons
        .map((comparison) => comparison.hypothesisId)
        .filter((id): id is string => Boolean(id))
    ),
  ];

  const hypotheses =
    hypothesisIds.length > 0
      ? await db
          .select()
          .from(creativeHypotheses)
          .where(
            and(
              eq(creativeHypotheses.workspaceId, workspaceId),
              inArray(creativeHypotheses.id, hypothesisIds)
            )
          )
      : [];

  const variants =
    hypothesisIds.length > 0
      ? await db
          .select()
          .from(hypothesisVariants)
          .where(inArray(hypothesisVariants.hypothesisId, hypothesisIds))
      : [];

  const derivationIds = [...new Set(variants.map((variant) => variant.derivationId))];
  const derivationRows =
    derivationIds.length > 0
      ? await db
          .select({
            id: derivations.id,
            campaignId: derivations.campaignId,
            format: derivations.format,
            generationMode: derivations.generationMode,
            ctaText: derivations.ctaText,
            styleAssetId: derivations.styleAssetId,
          })
          .from(derivations)
          .where(
            and(
              eq(derivations.workspaceId, workspaceId),
              inArray(derivations.id, derivationIds)
            )
          )
      : [];

  const campaignsById = new Map(clientCampaigns.map((campaign) => [campaign.id, campaign]));
  const hypothesesById = new Map(hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const variantsByHypothesis = new Map<string, typeof variants>();
  for (const variant of variants) {
    const list = variantsByHypothesis.get(variant.hypothesisId) ?? [];
    list.push(variant);
    variantsByHypothesis.set(variant.hypothesisId, list);
  }
  const derivationsById = new Map(derivationRows.map((row) => [row.id, row]));

  return comparisons.map((comparison) => ({
    comparison,
    hypothesis: comparison.hypothesisId
      ? hypothesesById.get(comparison.hypothesisId) ?? null
      : null,
    variants: comparison.hypothesisId
      ? variantsByHypothesis.get(comparison.hypothesisId) ?? []
      : [],
    derivations: derivationsById,
    campaigns: campaignsById,
  }));
}

export async function syncLearningsForClient(input: {
  workspaceId: string;
  clientProfileId: string;
  drafts: DerivedLearningDraft[];
}): Promise<{
  upserted: ClientPerformanceLearning[];
  removed: ClientPerformanceLearning[];
}> {
  const existing = await listLearningsByClientProfile(
    input.clientProfileId,
    input.workspaceId
  );

  const draftKeys = new Set(
    input.drafts.map(
      (draft) =>
        `${draft.variableKey}::${draft.variableValue.toLowerCase()}::${draft.primaryMetric}`
    )
  );

  const removed: ClientPerformanceLearning[] = [];
  const upserted: ClientPerformanceLearning[] = [];

  return db.transaction(async (tx) => {
    for (const row of existing) {
      const key = `${row.variableKey}::${row.variableValue.toLowerCase()}::${row.primaryMetric}`;
      if (!draftKeys.has(key) && row.status !== "removed") {
        const [updated] = await tx
          .update(clientPerformanceLearnings)
          .set({ status: "removed", updatedAt: new Date() })
          .where(eq(clientPerformanceLearnings.id, row.id))
          .returning();
        if (updated) removed.push(updated);
      }
    }

    for (const draft of input.drafts) {
      const payload: NewClientPerformanceLearning = {
        workspaceId: input.workspaceId,
        clientProfileId: input.clientProfileId,
        variableKey: draft.variableKey,
        variableValue: draft.variableValue,
        primaryMetric: draft.primaryMetric,
        expectedDirection: draft.expectedDirection,
        statement: draft.statement,
        confidence: draft.confidence,
        confidenceScore: draft.confidenceScore,
        sampleImpressions: draft.sampleImpressions,
        sampleCampaignCount: draft.sampleCampaignCount,
        contextPlatforms: draft.contextPlatforms,
        contextObjectives: draft.contextObjectives,
        supportingEvidence: draft.supportingEvidence,
        contradictingEvidence: draft.contradictingEvidence,
        algorithmVersion: LEARNING_ALGORITHM_VERSION,
        status: draft.status,
        lastEvidenceAt: draft.lastEvidenceAt,
        approvedAt: draft.status === "approved" ? new Date() : null,
        updatedAt: new Date(),
      };

      const [row] = await tx
        .insert(clientPerformanceLearnings)
        .values(payload)
        .onConflictDoUpdate({
          target: [
            clientPerformanceLearnings.workspaceId,
            clientPerformanceLearnings.clientProfileId,
            clientPerformanceLearnings.variableKey,
            clientPerformanceLearnings.variableValue,
            clientPerformanceLearnings.primaryMetric,
          ],
          set: {
            expectedDirection: payload.expectedDirection,
            statement: payload.statement,
            confidence: payload.confidence,
            confidenceScore: payload.confidenceScore,
            sampleImpressions: payload.sampleImpressions,
            sampleCampaignCount: payload.sampleCampaignCount,
            contextPlatforms: payload.contextPlatforms,
            contextObjectives: payload.contextObjectives,
            supportingEvidence: payload.supportingEvidence,
            contradictingEvidence: payload.contradictingEvidence,
            algorithmVersion: payload.algorithmVersion,
            status: payload.status,
            lastEvidenceAt: payload.lastEvidenceAt,
            approvedAt: payload.approvedAt,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (row) upserted.push(row);
    }

    return { upserted, removed };
  });
}

export async function updateLearningMem0Id(
  learningId: string,
  workspaceId: string,
  mem0MemoryId: string | null
) {
  await db
    .update(clientPerformanceLearnings)
    .set({ mem0MemoryId, updatedAt: new Date() })
    .where(
      and(
        eq(clientPerformanceLearnings.id, learningId),
        eq(clientPerformanceLearnings.workspaceId, workspaceId)
      )
    );
}
