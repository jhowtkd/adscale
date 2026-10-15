import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { campaigns, creativeWorkItems, creativeWorkOutputs, creativeWorkPreparationAttempts, derivations, humanQualityCorpusItems, humanQualityEvaluations, outputDecisionEvents } from "../../db/schema";
import { buildGuidanceImpactReport } from "./aggregate";
import type { GuidanceImpactGeneration, GuidanceImpactReport } from "./types";

/** Read persisted delivery evidence only; never consult live selections or client_output_learnings. */
export async function runGuidanceImpact(input: { workspaceId: string; clientProfileId: string; capturedAt?: string }): Promise<GuidanceImpactReport> {
  const workScope = and(eq(creativeWorkItems.workspaceId, input.workspaceId), eq(creativeWorkItems.clientProfileId, input.clientProfileId));
  const [outputs, legacy, attempts, decisions, evaluations] = await Promise.all([
    db.select({ id: creativeWorkOutputs.id, contextId: creativeWorkItems.id,
      generationMode: sql<string | null>`coalesce(${creativeWorkOutputs.frozenGuidance}->>'generationMode', ${creativeWorkItems.toolKind})`,
      format: creativeWorkOutputs.targetFormat, applications: creativeWorkOutputs.guidanceApplications })
      .from(creativeWorkOutputs).innerJoin(creativeWorkItems, and(eq(creativeWorkItems.id, creativeWorkOutputs.workItemId), eq(creativeWorkItems.workspaceId, creativeWorkOutputs.workspaceId)))
      .where(and(workScope, eq(creativeWorkOutputs.status, "completed"))),
    db.select({ id: derivations.id, contextId: campaigns.id, generationMode: derivations.generationMode,
      format: derivations.format, applications: derivations.legacyGuidanceApplications })
      .from(derivations).innerJoin(campaigns, and(eq(campaigns.id, derivations.campaignId), eq(campaigns.workspaceId, derivations.workspaceId)))
      .where(and(eq(campaigns.workspaceId, input.workspaceId), eq(campaigns.clientProfileId, input.clientProfileId), inArray(derivations.status, ["completed", "approved", "rejected"]))),
    db.select({ id: creativeWorkPreparationAttempts.id, contextId: creativeWorkItems.id,
      generationMode: sql<string | null>`case when ${creativeWorkPreparationAttempts.frozenCarouselGuidance} is not null then 'carousel' else ${creativeWorkPreparationAttempts.frozenGuidance}->>'generationMode' end`,
      format: sql<string | null>`coalesce(${creativeWorkPreparationAttempts.frozenCarouselGuidance}->>'format', ${creativeWorkPreparationAttempts.frozenGuidance}->>'format')`, applications: creativeWorkPreparationAttempts.guidanceApplications })
      .from(creativeWorkPreparationAttempts).innerJoin(creativeWorkItems, and(eq(creativeWorkItems.id, creativeWorkPreparationAttempts.workItemId), eq(creativeWorkItems.workspaceId, creativeWorkPreparationAttempts.workspaceId)))
      .where(workScope),
    db.select({ id: outputDecisionEvents.id, outputId: outputDecisionEvents.creativeWorkOutputId, derivationId: outputDecisionEvents.derivationId,
      authorType: outputDecisionEvents.authorType, action: outputDecisionEvents.action, snapshot: outputDecisionEvents.contextSnapshot })
      .from(outputDecisionEvents).where(and(eq(outputDecisionEvents.workspaceId, input.workspaceId), eq(outputDecisionEvents.clientProfileId, input.clientProfileId))),
    db.selectDistinctOn([humanQualityCorpusItems.derivationId], { derivationId: humanQualityCorpusItems.derivationId,
      humanVisualScore: humanQualityEvaluations.visualScore, factualPass: humanQualityEvaluations.factualPass })
      .from(humanQualityCorpusItems).innerJoin(humanQualityEvaluations, and(eq(humanQualityEvaluations.corpusItemId, humanQualityCorpusItems.id), eq(humanQualityEvaluations.workspaceId, humanQualityCorpusItems.workspaceId)))
      .where(and(eq(humanQualityCorpusItems.workspaceId, input.workspaceId), eq(humanQualityCorpusItems.clientProfileId, input.clientProfileId), eq(humanQualityCorpusItems.status, "evaluated")))
      .orderBy(humanQualityCorpusItems.derivationId, desc(humanQualityEvaluations.createdAt), desc(humanQualityEvaluations.id)),
  ]);
  const metrics = new Map(evaluations.map(item => [item.derivationId, item]));
  const scope = { workspaceId: input.workspaceId, clientProfileId: input.clientProfileId };
  const generations: GuidanceImpactGeneration[] = [
    ...outputs.map(item => ({ ...scope, ...item, contextKind: "creative_work" as const, id: `output:${item.id}` })),
    ...legacy.map(item => ({ ...scope, ...item, contextKind: "legacy_campaign" as const, ...metrics.get(item.id), id: `derivation:${item.id}` })),
    // Attempts hold editorial calls and carousel slides. Absence never establishes a control.
    ...attempts.filter(item => item.applications?.length).flatMap(item => {
      const executions = Map.groupBy(item.applications!, application => application.executionId);
      return [...executions].map(([id, applications]) => ({ ...scope, ...item, contextKind: "creative_work" as const, id: `attempt:${id}`, applications }));
    }),
  ];
  return buildGuidanceImpactReport({ generations, decisions: decisions.map(item => ({ ...item,
    generationId: item.outputId ? `output:${item.outputId}` : `derivation:${item.derivationId}` })), capturedAt: input.capturedAt ?? new Date().toISOString() });
}
