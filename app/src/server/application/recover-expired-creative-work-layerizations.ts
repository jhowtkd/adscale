import "server-only";

import { logger } from "@/lib/logger";
import { layerizationStateFromDatabase, type LayerizationState } from "@/server/layerize/contracts";
import {
  claimExpiredCreativeWorkLayerizationRecovery,
  releaseCreativeWorkLayerizationRecoveryLease,
} from "@/server/repositories/creative-work-layerization";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { releaseLayerEditorQuota, withLayerEditorPostDispatchLock } from "@/server/layer-editor/quota";

export async function recoverExpiredCreativeWorkLayerizations(input: {
  workspaceId: string;
  workItemId: string;
  outputs: Array<{ id: string; layerization: unknown }>;
  now?: Date;
}): Promise<Map<string, LayerizationState>> {
  const now = input.now ?? new Date();
  const recovered = new Map<string, LayerizationState>();
  for (const output of input.outputs) {
    const current = layerizationStateFromDatabase(output.layerization);
    if (!current || !["queued", "processing", "reconciling", "finalizing"].includes(current.status)) continue;
    if (current.status !== "finalizing" && Date.parse(current.callbackDeadlineAt) > now.getTime()) continue;
    const claimed = await withLayerEditorPostDispatchLock({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: current.attemptId }, async (executor) => {
      const claimed = await claimExpiredCreativeWorkLayerizationRecovery({
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: output.id,
        attemptId: current.attemptId,
        now,
      }, executor);
      const claimedState = layerizationStateFromDatabase(claimed?.layerization);
      if (current.status === "queued" && claimedState?.attemptId === current.attemptId && claimedState.status === "submission_unknown" && !claimedState.providerRequestId) {
        await releaseLayerEditorQuota({
          workspaceId: input.workspaceId,
          kind: "layerize_v1",
          operationId: current.attemptId,
        }, now, executor);
      }
      return claimed;
    });
    const state = layerizationStateFromDatabase(claimed?.layerization);
    if (!state) continue;
    recovered.set(output.id, state);
    if (!state.providerRequestId || !["reconciling", "finalizing"].includes(state.status)) continue;
    try {
      await inngest.send({
        id: `creative-work-layerize:${output.id}:${state.attemptId}:recovery:${state.updatedAt}`,
        name: heavyImageEventName("creative-work.layerize"),
        data: {
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          outputId: output.id,
          attemptId: state.attemptId,
        },
      });
    } catch (error) {
      try {
        await releaseCreativeWorkLayerizationRecoveryLease({
          workspaceId: input.workspaceId,
          workItemId: input.workItemId,
          outputId: output.id,
          attemptId: state.attemptId,
          claimedAt: state.updatedAt,
          now,
        });
      } catch (releaseError) {
        logger.warn(`[creativeWork] layerization recovery lease release failed outputId=${output.id}: ${releaseError instanceof Error ? releaseError.message : String(releaseError)}`);
      }
      logger.warn(`[creativeWork] layerization recovery dispatch failed outputId=${output.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return recovered;
}
