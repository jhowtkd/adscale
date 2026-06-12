import { logger } from "@/lib/logger";
import type { ClientPerformanceLearning } from "../db/schema";
import { updateLearningMem0Id } from "../repositories/client-learning";
import { getBrandMemoryUserId, getMem0Client } from "./mem0-client";

export const PERFORMANCE_LEARNING_MEMORY_TYPE = "performance_learning";

function buildProjectionContent(learning: ClientPerformanceLearning): string {
  return JSON.stringify({
    memoryType: PERFORMANCE_LEARNING_MEMORY_TYPE,
    learningId: learning.id,
    clientProfileId: learning.clientProfileId,
    variableKey: learning.variableKey,
    variableValue: learning.variableValue,
    primaryMetric: learning.primaryMetric,
    confidence: learning.confidence,
    algorithmVersion: learning.algorithmVersion,
    statement: learning.statement,
    sampleImpressions: learning.sampleImpressions,
    sampleCampaignCount: learning.sampleCampaignCount,
    supportingCount: learning.supportingEvidence.length,
    contradictingCount: learning.contradictingEvidence.length,
    contextPlatforms: learning.contextPlatforms ?? [],
    contextObjectives: learning.contextObjectives ?? [],
  });
}

function buildProjectionMetadata(learning: ClientPerformanceLearning) {
  return {
    memoryType: PERFORMANCE_LEARNING_MEMORY_TYPE,
    learningId: learning.id,
    clientProfileId: learning.clientProfileId,
    workspaceId: learning.workspaceId,
    variableKey: learning.variableKey,
    variableValue: learning.variableValue,
    primaryMetric: learning.primaryMetric,
    confidence: learning.confidence,
    algorithmVersion: learning.algorithmVersion,
    status: learning.status,
    source: "ADScale performance_learning",
  };
}

export async function projectPerformanceLearning(
  learning: ClientPerformanceLearning
): Promise<{ status: "disabled" | "projected" | "updated" | "removed" | "failed" }> {
  const client = getMem0Client();
  if (!client) {
    return { status: "disabled" };
  }

  if (learning.status === "removed" || learning.status === "superseded") {
    if (!learning.mem0MemoryId) {
      return { status: "removed" };
    }
    try {
      await client.delete(learning.mem0MemoryId);
      await updateLearningMem0Id(learning.id, learning.workspaceId, null);
      return { status: "removed" };
    } catch (error) {
      logger.warn(
        { error, learningId: learning.id },
        "[performance-learning] mem0 delete failed"
      );
      return { status: "failed" };
    }
  }

  if (learning.status !== "approved") {
    return { status: "disabled" };
  }

  const content = buildProjectionContent(learning);
  const metadata = buildProjectionMetadata(learning);
  const userId = getBrandMemoryUserId(learning.workspaceId);

  try {
    if (learning.mem0MemoryId) {
      await client.update(learning.mem0MemoryId, { text: content, metadata });
      return { status: "updated" };
    }

    const created = await client.add([{ role: "user", content }], {
      user_id: userId,
      metadata,
      infer: false,
    });
    const memoryId = created[0]?.id;
    if (memoryId) {
      await updateLearningMem0Id(learning.id, learning.workspaceId, memoryId);
    }
    return { status: "projected" };
  } catch (error) {
    logger.warn(
      { error, learningId: learning.id, workspaceId: learning.workspaceId },
      "[performance-learning] mem0 projection failed"
    );
    return { status: "failed" };
  }
}

export async function projectPerformanceLearnings(
  learnings: ClientPerformanceLearning[]
) {
  const results = await Promise.all(
    learnings.map((learning) => projectPerformanceLearning(learning))
  );
  return results;
}
