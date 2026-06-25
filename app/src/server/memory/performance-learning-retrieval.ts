import { logger } from "@/lib/logger";
import {
  getLearningsByIds,
  listLearningsByClientProfile,
} from "../repositories/client-learning";
import type { ResolvedPerformanceLearning } from "../performance/learning/types";
import { PERFORMANCE_LEARNING_MEMORY_TYPE } from "./performance-learning-projection";
import { getBrandMemoryUserId, getMem0Client } from "./mem0-client";

interface Mem0SearchResult {
  id?: string;
  memory?: string;
  text?: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface PerformanceLearningSearchInput {
  workspaceId: string;
  clientProfileId: string;
  query?: string;
  campaignObjective?: string | null;
  platform?: string | null;
  limit?: number;
}

function toResolvedLearning(
  row: Awaited<ReturnType<typeof getLearningsByIds>>[number],
  relevance?: number
): ResolvedPerformanceLearning {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    clientProfileId: row.clientProfileId,
    variableKey: row.variableKey,
    variableValue: row.variableValue,
    primaryMetric: row.primaryMetric,
    expectedDirection: row.expectedDirection as "increase" | "decrease" | null,
    statement: row.statement,
    confidence: row.confidence as ResolvedPerformanceLearning["confidence"],
    confidenceScore: String(row.confidenceScore),
    sampleImpressions: row.sampleImpressions,
    sampleCampaignCount: row.sampleCampaignCount,
    contextPlatforms: row.contextPlatforms ?? [],
    contextObjectives: row.contextObjectives ?? [],
    supportingEvidence: row.supportingEvidence,
    contradictingEvidence: row.contradictingEvidence,
    algorithmVersion: row.algorithmVersion,
    status: row.status as ResolvedPerformanceLearning["status"],
    mem0MemoryId: row.mem0MemoryId,
    approvedAt: row.approvedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastEvidenceAt: row.lastEvidenceAt,
    relevance,
  };
}

function buildSearchQuery(input: PerformanceLearningSearchInput) {
  return [
    input.query?.trim(),
    input.campaignObjective ? `campaign objective: ${input.campaignObjective}` : "",
    input.platform ? `platform: ${input.platform}` : "",
    "performance learning CTA format recipe style evidence confidence",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function searchPerformanceLearnings(
  input: PerformanceLearningSearchInput
): Promise<{
  source: "mem0" | "postgres";
  learnings: ResolvedPerformanceLearning[];
}> {
  const canonicalFallback = await listLearningsByClientProfile(
    input.clientProfileId,
    input.workspaceId,
    { status: "approved" }
  );

  const client = getMem0Client();
  if (!client) {
    return {
      source: "postgres",
      learnings: canonicalFallback
        .slice(0, input.limit ?? 12)
        .map((row) => toResolvedLearning(row)),
    };
  }

  try {
    const userId = getBrandMemoryUserId(input.workspaceId, input.clientProfileId);
    const results = (await client.search(buildSearchQuery(input), {
      user_id: userId,
      limit: input.limit ?? 12,
      filters: {
        AND: [
          { metadata: { memoryType: PERFORMANCE_LEARNING_MEMORY_TYPE } },
          { metadata: { clientProfileId: input.clientProfileId } },
        ],
      },
    })) as Mem0SearchResult[] | { results?: Mem0SearchResult[] };

    const rows = Array.isArray(results) ? results : (results.results ?? []);
    const ranked = rows.flatMap((item) => {
      const learningId = item.metadata?.learningId;
      if (typeof learningId !== "string" || !learningId) return [];
      return [{ learningId, relevance: item.score }];
    });

    if (ranked.length === 0) {
      return {
        source: "postgres",
        learnings: canonicalFallback
          .slice(0, input.limit ?? 12)
          .map((row) => toResolvedLearning(row)),
      };
    }

    const canonicalRows = await getLearningsByIds(
      ranked.map((item) => item.learningId),
      input.workspaceId
    );
    const byId = new Map(canonicalRows.map((row) => [row.id, row]));

    const learnings = ranked
      .map((item) => {
        const row = byId.get(item.learningId);
        if (!row || row.status !== "approved") return null;
        return toResolvedLearning(row, item.relevance);
      })
      .filter((row): row is ResolvedPerformanceLearning => row !== null);

    return { source: "mem0", learnings };
  } catch (error) {
    logger.warn(
      { error, workspaceId: input.workspaceId, clientProfileId: input.clientProfileId },
      "[performance-learning] mem0 search failed; falling back to postgres"
    );
    return {
      source: "postgres",
      learnings: canonicalFallback
        .slice(0, input.limit ?? 12)
        .map((row) => toResolvedLearning(row)),
    };
  }
}
