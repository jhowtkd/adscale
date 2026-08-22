import "server-only";

import { randomBytes } from "node:crypto";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  claimCreativeWorkLayerization,
  clearFailedCreativeWorkLayerizationForRetry,
  failQueuedCreativeWorkLayerization,
  getCreativeWorkLayerizationOutput,
  hashLayerizationCallbackToken,
} from "@/server/repositories/creative-work-layerization";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";
import { inngest } from "@/server/jobs/client";
import {
  LAYERIZATION_CALLBACK_TTL_MS,
  isLayerizationRetryableFailure,
  layerizationStateFromDatabase,
  type LayerizationState,
} from "@/server/layerize/contracts";
import {
  SEEDREAM_LAYERIZE_MODEL_ID,
  SEEDREAM_PROVIDER_ENDPOINT,
} from "@/server/layerize/seedream-provider";
import { env } from "@/server/validation/env";
import { claimLayerEditorQuota, releaseLayerEditorQuota } from "@/server/layer-editor/quota";

export type RequestCreativeWorkLayerizationError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_eligible" }
  | { code: "layerization_not_configured" }
  | { code: "already_running"; state: LayerizationState }
  | { code: "submission_unknown"; state: LayerizationState }
  | { code: "failed"; state: LayerizationState }
  | { code: "dispatch_failed" };

export type RequestCreativeWorkLayerizationResult =
  | { ok: true; accepted: boolean; replay: boolean; state: LayerizationState }
  | { ok: false; error: RequestCreativeWorkLayerizationError };

function callbackUrlWithToken(baseUrl: string, input: { outputId: string; attemptId: string; token: string }): string {
  const url = new URL(baseUrl);
  url.searchParams.set("layerizeCallback", "1");
  url.searchParams.set("outputId", input.outputId);
  url.searchParams.set("attemptId", input.attemptId);
  url.searchParams.set("token", input.token);
  return url.toString();
}

function newLayerizationState(input: {
  userId: string;
  attemptId: string;
  tokenHash: string;
}): LayerizationState {
  const now = new Date();
  return {
    status: "queued",
    attemptId: input.attemptId,
    callbackTokenHash: input.tokenHash,
    callbackConsumedAt: null,
    requestedByUserId: input.userId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    callbackDeadlineAt: new Date(now.getTime() + LAYERIZATION_CALLBACK_TTL_MS).toISOString(),
    latencyMs: null,
    providerRequestId: null,
    providerModel: SEEDREAM_LAYERIZE_MODEL_ID,
    providerEndpoint: SEEDREAM_PROVIDER_ENDPOINT,
    estimatedCostUsd: null,
    baseWidth: null,
    baseHeight: null,
    layers: [],
    psdKey: null,
    diagnosticZipKey: null,
    fidelity: null,
    failureCode: null,
  };
}

export async function requestCreativeWorkLayerization(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  userId: string;
  callbackUrl: string;
  operationId: string;
  retry?: boolean;
}): Promise<RequestCreativeWorkLayerizationResult> {
  if (!env.ATLASCLOUD_API_KEY?.trim()) {
    return { ok: false, error: { code: "layerization_not_configured" } };
  }
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId);
  if (!aggregate) return { ok: false, error: { code: "work_not_found" } };
  const output = aggregate.outputs.find((candidate) => candidate.id === input.outputId);
  if (!output) return { ok: false, error: { code: "output_not_found" } };
  if (output.status !== "completed" || !output.outputKey || !output.isSelected) {
    return { ok: false, error: { code: "output_not_eligible" } };
  }

  let existing = layerizationStateFromDatabase(output.layerization);
  if (existing?.status === "submission_unknown") {
    return { ok: false, error: { code: "submission_unknown", state: existing } };
  }
  if (existing && existing.status !== "failed") {
    return { ok: false, error: { code: "already_running", state: existing } };
  }
  if (existing && !input.retry) {
    return { ok: false, error: { code: "failed", state: existing } };
  }
  if (existing && !isLayerizationRetryableFailure(existing)) {
    return { ok: false, error: { code: "failed", state: existing } };
  }
  if (existing) {
    const cleared = await clearFailedCreativeWorkLayerizationForRetry(input);
    if (!cleared) {
      const refreshed = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId);
      existing = layerizationStateFromDatabase(refreshed?.layerization);
      if (existing) return { ok: false, error: { code: "already_running", state: existing } };
    }
  }

  const quota = await claimLayerEditorQuota({
    workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId, userId: input.userId,
    workItemId: input.workItemId, outputId: input.outputId,
  }, new Date());
  if (!quota.ok) return { ok: false, error: { code: "layerization_not_configured" } };

  const token = randomBytes(32).toString("hex");
  const attemptId = input.operationId;
  const state = newLayerizationState({
    userId: input.userId,
    attemptId,
    tokenHash: hashLayerizationCallbackToken(token),
  });
  const claimed = await claimCreativeWorkLayerization({
    workspaceId: input.workspaceId,
    workItemId: input.workItemId,
    outputId: input.outputId,
    state,
  });
  if (!claimed) {
    await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, new Date());
    const refreshed = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId);
    const refreshedState = layerizationStateFromDatabase(refreshed?.layerization);
    return refreshedState
      ? { ok: false, error: { code: "already_running", state: refreshedState } }
      : { ok: false, error: { code: "output_not_eligible" } };
  }

  try {
    await inngest.send({
      id: `creative-work-layerize:${input.outputId}:${attemptId}`,
      name: heavyImageEventName("creative-work.layerize"),
      data: {
        workspaceId: input.workspaceId,
        workItemId: input.workItemId,
        outputId: input.outputId,
        attemptId,
        callbackUrl: callbackUrlWithToken(input.callbackUrl, {
          outputId: input.outputId,
          attemptId,
          token,
        }),
      },
    });
  } catch {
    const failed = await failQueuedCreativeWorkLayerization({
      workspaceId: input.workspaceId,
      workItemId: input.workItemId,
      outputId: input.outputId,
      attemptId,
      code: "dispatch_failed",
    });
    if (failed) {
      await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, new Date());
      return { ok: false, error: { code: "dispatch_failed" } };
    }
    const refreshed = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId);
    const refreshedState = layerizationStateFromDatabase(refreshed?.layerization);
    if (refreshedState && refreshedState.attemptId === attemptId && refreshedState.status !== "failed") {
      return { ok: true, accepted: true, replay: false, state: refreshedState };
    }
    return { ok: false, error: { code: "dispatch_failed" } };
  }
  return { ok: true, accepted: true, replay: false, state };
}
