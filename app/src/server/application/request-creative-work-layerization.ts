import "server-only";

import { randomBytes } from "node:crypto";
import { getCreativeWork } from "@/server/repositories/creative-work";
import {
  claimCreativeWorkLayerization,
  clearFailedCreativeWorkLayerizationForRetry,
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
import { claimLayerEditorQuota, isLayerEditorQuotaDispatchCommitted, isLayerEditorQuotaReleased, isLayerEditorQuotaReservationCommitted, markLayerEditorQuotaDispatchCommitted, markLayerEditorQuotaReservationCommitted, releaseLayerEditorQuota, withLayerEditorOperationLock, withLayerEditorPostDispatchLock, type LayerEditorOperationExecutor } from "@/server/layer-editor/quota";

export type RequestCreativeWorkLayerizationError =
  | { code: "work_not_found" }
  | { code: "output_not_found" }
  | { code: "output_not_eligible" }
  | { code: "layerization_not_configured" }
  | { code: "layer_editor_not_available" }
  | { code: "layer_editor_quota_exhausted" }
  | { code: "layerization_replay_conflict" }
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
  const decision = await withLayerEditorOperationLock({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, (executor) => requestCreativeWorkLayerizationLocked(input, executor));
  if (decision.kind === "result") return decision.result;
  return withLayerEditorPostDispatchLock({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, async (executor) => {
      const current = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId, executor);
      const currentState = layerizationStateFromDatabase(current?.layerization);
      if (currentState?.attemptId !== decision.state.attemptId) return { ok: false, error: { code: "layerization_replay_conflict" } };
      if (currentState.status !== "queued") {
        if (currentState.status === "failed") return { ok: false, error: { code: "failed", state: currentState } };
        return { ok: true, accepted: true, replay: false, state: currentState };
      }
      if (await isLayerEditorQuotaDispatchCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor)) return { ok: true, accepted: false, replay: true, state: currentState };
      try {
        await inngest.send({ id: `creative-work-layerize:${input.outputId}:${decision.state.attemptId}`, name: heavyImageEventName("creative-work.layerize"), data: { workspaceId: input.workspaceId, workItemId: input.workItemId, outputId: input.outputId, attemptId: decision.state.attemptId, ...(decision.callbackUrl ? { callbackUrl: decision.callbackUrl } : {}) } });
      } catch {
      return { ok: false, error: { code: "dispatch_failed" } };
      }
      await markLayerEditorQuotaDispatchCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor);
      return { ok: true, accepted: decision.accepted, replay: decision.replay, state: decision.state };
  });
}

async function requestCreativeWorkLayerizationLocked(input: {
  workspaceId: string;
  workItemId: string;
  outputId: string;
  userId: string;
  callbackUrl: string;
  operationId: string;
  retry?: boolean;
}, executor: LayerEditorOperationExecutor): Promise<{ kind: "result"; result: RequestCreativeWorkLayerizationResult } | { kind: "dispatch"; state: LayerizationState; accepted: boolean; replay: boolean; callbackUrl?: string }> {
  const result = (value: RequestCreativeWorkLayerizationResult) => ({ kind: "result" as const, result: value });
  if (!env.ATLASCLOUD_API_KEY?.trim()) {
    return result({ ok: false, error: { code: "layerization_not_configured" } });
  }
  const aggregate = await getCreativeWork(input.workspaceId, input.workItemId, executor);
  if (!aggregate) return result({ ok: false, error: { code: "work_not_found" } });
  const output = aggregate.outputs.find((candidate) => candidate.id === input.outputId);
  if (!output) return result({ ok: false, error: { code: "output_not_found" } });
  if (output.status !== "completed" || !output.outputKey || !output.isSelected) {
    return result({ ok: false, error: { code: "output_not_eligible" } });
  }

  let existing = layerizationStateFromDatabase(output.layerization);
  if (existing?.status === "submission_unknown") {
    return result({ ok: false, error: { code: "submission_unknown", state: existing } });
  }
  // A terminal attempt is immutable for its original operation id. Retrying
  // with that id could reuse a compensated claim and issue a second provider
  // submission without a net quota unit.
  if (existing?.status === "failed" && existing.attemptId === input.operationId) {
    return result({ ok: false, error: { code: "failed", state: existing } });
  }
  const queuedReplay = existing?.status === "queued" && existing.attemptId === input.operationId;
  if (existing && existing.status !== "failed" && !queuedReplay) {
    return result({ ok: false, error: { code: "already_running", state: existing } });
  }
  if (existing && !input.retry && !queuedReplay) {
    return result({ ok: false, error: { code: "failed", state: existing } });
  }
  if (existing && !queuedReplay && !isLayerizationRetryableFailure(existing)) {
    return result({ ok: false, error: { code: "failed", state: existing } });
  }
  const quota = await claimLayerEditorQuota({
    workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId, userId: input.userId,
    workItemId: input.workItemId, outputId: input.outputId,
  }, new Date(), executor);
  if (!quota.ok) return result({ ok: false, error: { code: quota.code === "disabled" ? "layer_editor_not_available" : quota.code === "operation_conflict" ? "layerization_replay_conflict" : "layer_editor_quota_exhausted" } });
  if (queuedReplay && existing) {
    await markLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor);
    return { kind: "dispatch", state: existing, accepted: false, replay: true };
  }
  if (quota.replay && (await isLayerEditorQuotaReleased({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor) || await isLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor))) return result({ ok: false, error: { code: "layerization_replay_conflict" } });

  // Retain the terminal evidence until entitlement/quota admission has
  // succeeded. A rejected retry must not erase a diagnosable provider failure.
  if (existing) {
    const cleared = await clearFailedCreativeWorkLayerizationForRetry(input, executor);
    if (!cleared) {
      await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, new Date(), executor);
      const refreshed = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId, executor);
      existing = layerizationStateFromDatabase(refreshed?.layerization);
      if (existing) return result({ ok: false, error: { code: "already_running", state: existing } });
    }
  }

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
  }, executor);
  if (!claimed) {
    const refreshed = await getCreativeWorkLayerizationOutput(input.workspaceId, input.workItemId, input.outputId, executor);
    const refreshedState = layerizationStateFromDatabase(refreshed?.layerization);
    if (!refreshedState || refreshedState.attemptId !== attemptId) {
      // A quota claim alone is not authority to retain a unit. This covers a
      // process crash or losing reservation CAS after a replayed claim.
      if (!(await isLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor))) await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, new Date(), executor);
    }
    if (refreshedState?.status === "queued" && refreshedState.attemptId === attemptId) {
      await markLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor);
      return { kind: "dispatch", state: refreshedState, accepted: false, replay: true };
    }
    return refreshedState
      ? result({ ok: false, error: { code: "already_running", state: refreshedState } })
      : result({ ok: false, error: { code: "output_not_eligible" } });
  }
  await markLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layerize_v1", operationId: input.operationId }, executor);
  return { kind: "dispatch", accepted: true, replay: false, state, callbackUrl: callbackUrlWithToken(input.callbackUrl, { outputId: input.outputId, attemptId, token }) };
}
