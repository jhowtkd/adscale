import { logger } from "@/lib/logger";
import type { ClientOutputLearning } from "../db/schema";
import { updateOutputLearningMem0Id } from "../repositories/client-output-learning";
import { getBrandMemoryUserId, getMem0Client } from "./mem0-client";

export const OUTPUT_LEARNING_MEMORY_TYPE = "output_learning";

function buildProjectionContent(learning: ClientOutputLearning): string {
  return JSON.stringify({
    memoryType: OUTPUT_LEARNING_MEMORY_TYPE,
    learningId: learning.id,
    clientProfileId: learning.clientProfileId,
    variableKey: learning.variableKey,
    variableValue: learning.variableValue,
    scopeGenerationMode: learning.scopeGenerationMode,
    scopeFormat: learning.scopeFormat,
    preferenceDirection: learning.preferenceDirection,
    confidence: learning.confidence,
    algorithmVersion: learning.algorithmVersion,
    statement: learning.statement,
    sampleEventCount: learning.sampleEventCount,
    sampleCampaignCount: learning.sampleCampaignCount,
    supportingCount: learning.supportingEvidence.length,
    contradictingCount: learning.contradictingEvidence.length,
  });
}

function buildProjectionMetadata(learning: ClientOutputLearning) {
  return {
    memoryType: OUTPUT_LEARNING_MEMORY_TYPE,
    learningId: learning.id,
    clientProfileId: learning.clientProfileId,
    workspaceId: learning.workspaceId,
    variableKey: learning.variableKey,
    variableValue: learning.variableValue,
    scopeGenerationMode: learning.scopeGenerationMode,
    scopeFormat: learning.scopeFormat,
    preferenceDirection: learning.preferenceDirection,
    confidence: learning.confidence,
    algorithmVersion: learning.algorithmVersion,
    status: learning.status,
    source: "ADScale output_learning",
  };
}

export async function projectOutputLearning(
  learning: ClientOutputLearning
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
      await updateOutputLearningMem0Id(learning.id, learning.workspaceId, null);
      return { status: "removed" };
    } catch (error) {
      logger.warn(
        { error, learningId: learning.id },
        "[output-learning] mem0 delete failed"
      );
      return { status: "failed" };
    }
  }

  if (learning.status !== "approved") {
    return { status: "disabled" };
  }

  const content = buildProjectionContent(learning);
  const metadata = buildProjectionMetadata(learning);
  const userId = getBrandMemoryUserId(learning.workspaceId, learning.clientProfileId);

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
      await updateOutputLearningMem0Id(learning.id, learning.workspaceId, memoryId);
    }
    return { status: "projected" };
  } catch (error) {
    logger.warn(
      { error, learningId: learning.id, workspaceId: learning.workspaceId },
      "[output-learning] mem0 projection failed"
    );
    return { status: "failed" };
  }
}

export async function projectOutputLearnings(learnings: ClientOutputLearning[]) {
  const results = await Promise.all(
    learnings.map((learning) => projectOutputLearning(learning))
  );
  return results;
}
