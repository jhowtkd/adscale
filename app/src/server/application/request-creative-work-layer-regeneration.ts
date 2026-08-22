import "server-only";
import { createHash } from "node:crypto";
import { claimLayerEditorQuota, isLayerEditorQuotaReleased, isLayerEditorQuotaReservationCommitted, markLayerEditorQuotaReservationCommitted, releaseLayerEditorQuota, withLayerEditorOperationLock, type LayerEditorOperationExecutor } from "@/server/layer-editor/quota";
import { clearTerminalLayerRegenerationForRetry, getCreativeWorkLayerEditorOutput, layerEditorFromOutput, reserveLayerRegeneration, rollbackReservedLayerRegeneration } from "@/server/repositories/creative-work-layer-editor";
import { inngest } from "@/server/jobs/client";
import { heavyImageEventName } from "@/server/jobs/heavy-image-events";

export async function requestCreativeWorkLayerRegeneration(input: { workspaceId:string; workItemId:string; outputId:string; userId:string; leaseId:string; expectedRevision:number; operationId:string; layerId:string; instruction:string }) {
  const decision = await withLayerEditorOperationLock({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, (executor) => requestCreativeWorkLayerRegenerationLocked(input, executor));
  if (decision.kind !== "dispatch") return decision.result;
  try {
    await inngest.send({id:`creative-work-layer-regenerate:${input.outputId}:${input.operationId}`,name:heavyImageEventName("creative-work.layer-regenerate"),data:{workspaceId:input.workspaceId,workItemId:input.workItemId,outputId:input.outputId,operationId:input.operationId}});
    return {ok:true as const,accepted:decision.accepted,replay:decision.replay};
  } catch {
    return withLayerEditorOperationLock({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, async (executor) => {
      const state = layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(input, executor));
      if (state?.regeneration?.id === input.operationId && state.regeneration.status !== "reserved") return { ok: true as const, accepted: true, replay: false };
      const rolledBack = await rollbackReservedLayerRegeneration({ ...input, now: new Date() }, executor);
      if (rolledBack) await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, new Date(), executor);
      return { ok: false as const, code: "layer_regeneration_dispatch_failed" as const };
    });
  }
}

async function requestCreativeWorkLayerRegenerationLocked(input: { workspaceId:string; workItemId:string; outputId:string; userId:string; leaseId:string; expectedRevision:number; operationId:string; layerId:string; instruction:string }, executor: LayerEditorOperationExecutor) {
  const instruction=input.instruction.trim(); if(!instruction || instruction.length>2000)return {kind:"result" as const,result:{ok:false as const,code:"invalid_instruction" as const}};
  const current = layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(input, executor));
  const commandFingerprint = createHash("sha256").update(`${input.layerId}\u0000${instruction}`).digest("hex");
  const quota=await claimLayerEditorQuota({workspaceId:input.workspaceId,kind:"layer_regeneration_v1",operationId:input.operationId,userId:input.userId,workItemId:input.workItemId,outputId:input.outputId,commandFingerprint},new Date(),executor);
  if(!quota.ok)return {kind:"result" as const,result:{ok:false as const,code:quota.code === "operation_conflict" ? "layer_editor_revision_conflict" as const : quota.code}};
  if (quota.replay) {
    const state = layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(input, executor));
    if (state?.regeneration?.id === input.operationId) {
      if (state.regeneration.status === "reserved") {
        await markLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, executor);
        return { kind:"dispatch" as const, accepted:false, replay:true };
      }
      return { kind:"result" as const, result:{ ok:true as const, accepted:false, replay:true } };
    }
    if (await isLayerEditorQuotaReleased({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, executor) || await isLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, executor)) return { kind:"result" as const, result:{ ok: false as const, code: "layer_editor_revision_conflict" as const } };
  }
  let expectedRevision = input.expectedRevision;
  if (current?.regeneration && current.regeneration.id !== input.operationId && (current.regeneration.status === "failed" || current.regeneration.status === "submission_unknown")) {
    const cleared = await clearTerminalLayerRegenerationForRetry({ ...input, now: new Date() }, executor);
    const clearedState = layerEditorFromOutput(cleared);
    if (!clearedState) {
      await releaseLayerEditorQuota({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, new Date(), executor);
      return {kind:"result" as const,result:{ ok: false as const, code: "layer_editor_revision_conflict" as const }};
    }
    expectedRevision = clearedState.revision;
  }
  const reserved=await reserveLayerRegeneration({...input,expectedRevision,instruction,usageKey:`layer-editor:${input.workspaceId}:regeneration:${input.operationId}`,now:new Date()}, executor);
  if(!reserved){
    const state=layerEditorFromOutput(await getCreativeWorkLayerEditorOutput(input, executor));
    if(state?.regeneration?.id===input.operationId) {
      if (state.regeneration.status === "reserved") {
        await markLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, executor);
        return { kind:"dispatch" as const, accepted:false, replay:true };
      }
      return {kind:"result" as const,result:{ok:false as const,code:"layer_editor_revision_conflict" as const}};
    }
    // A persisted claim without a matching reservation is a pre-provider
    // crash/lost-CAS state. Releasing is idempotent even for a replayed claim.
    await releaseLayerEditorQuota({workspaceId:input.workspaceId,kind:"layer_regeneration_v1",operationId:input.operationId},new Date(), executor);
    return {kind:"result" as const,result:{ok:false as const,code:"layer_editor_revision_conflict" as const}};
  }
  await markLayerEditorQuotaReservationCommitted({ workspaceId: input.workspaceId, kind: "layer_regeneration_v1", operationId: input.operationId }, executor);
  return {kind:"dispatch" as const,accepted:true,replay:false};
}
